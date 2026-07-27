import {
	DeleteMessageCommand,
	ReceiveMessageCommand,
	type SQSClient,
} from "@aws-sdk/client-sqs";
import { performanceBatchSchema } from "@github-account-info/performance-schema";

import { cleanPerformanceEvent } from "./clean";
import type { ProcessorConfig } from "./config";
import type { PerformanceEventRepository } from "./repository";

export type ProcessorDependencies = {
	sqs: Pick<SQSClient, "send">;
	repository: PerformanceEventRepository;
	config: ProcessorConfig;
	now?: () => Date;
	log?: (record: Record<string, unknown>) => void;
};

/**
 * 处理单条 SQS 消息。
 *
 * 返回 rejected 的输入属于永久错误，调用方仍应删除消息；数据库或 AWS 等暂时性
 * 错误则继续抛出，让消息在 visibility timeout 后重试并最终进入 DLQ。
 */
export async function processMessage(
	body: string | undefined,
	repository: PerformanceEventRepository,
	now = new Date(),
	log: (record: Record<string, unknown>) => void = (record) =>
		console.log(JSON.stringify(record)),
): Promise<"processed" | "rejected"> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body ?? "");
	} catch {
		// 不记录原始 body，避免错误报告中泄漏浏览器上下文。
		log({
			level: "warn",
			message: "performance batch rejected",
			reason: "INVALID_JSON",
		});
		return "rejected";
	}
	const result = performanceBatchSchema.safeParse(parsed);
	if (!result.success) {
		log({
			level: "warn",
			message: "performance batch rejected",
			reason: "INVALID_SCHEMA",
		});
		return "rejected";
	}
	try {
		// 先清洗完整批次再开始事务；任一事件永久非法时整批稳定拒绝。
		const cleaned = result.data.events.map((event) =>
			cleanPerformanceEvent(event, now),
		);
		const inserted = await repository.insert(cleaned);
		for (const event of cleaned) {
			log({
				level: "info",
				message: "performance event cleaned",
				event,
			});
		}
		log({
			level: "info",
			message: "performance batch processed",
			received: cleaned.length,
			inserted,
			duplicates: cleaned.length - inserted,
		});
		return "processed";
	} catch (error) {
		if (
			error instanceof Error &&
			error.name === "PermanentPerformanceEventError"
		) {
			log({
				level: "warn",
				message: "performance batch rejected",
				reason: "TIMESTAMP_OUT_OF_RANGE",
			});
			return "rejected";
		}
		throw error;
	}
}

export async function runProcessor(
	dependencies: ProcessorDependencies,
	signal: AbortSignal,
): Promise<void> {
	const log =
		dependencies.log ??
		((record: Record<string, unknown>) => console.log(JSON.stringify(record)));
	let nextCleanupAt = 0;
	while (!signal.aborted) {
		const currentTime = dependencies.now?.() ?? new Date();
		// 清理失败不阻断消费；正常每天执行一次，失败后一小时再试。
		if (currentTime.getTime() >= nextCleanupAt) {
			try {
				const cutoff = new Date(
					currentTime.getTime() - 7 * 24 * 60 * 60 * 1_000,
				);
				const deleted = await dependencies.repository.deleteOlderThan(cutoff);
				log({
					level: "info",
					message: "expired performance events deleted",
					deleted,
					cutoff: cutoff.toISOString(),
				});
				nextCleanupAt = currentTime.getTime() + 24 * 60 * 60 * 1_000;
			} catch (error) {
				log({
					level: "error",
					message: "performance retention cleanup failed",
					errorName: error instanceof Error ? error.name : "UnknownError",
				});
				nextCleanupAt = currentTime.getTime() + 60 * 60 * 1_000;
			}
		}
		// SQS 长轮询降低空队列请求费用；visibility timeout 给清洗和数据库事务留出时间。
		const response = await dependencies.sqs.send(
			new ReceiveMessageCommand({
				QueueUrl: dependencies.config.PERFORMANCE_QUEUE_URL,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: dependencies.config.POLL_WAIT_SECONDS,
				VisibilityTimeout: dependencies.config.VISIBILITY_TIMEOUT_SECONDS,
			}),
		);
		for (const message of response.Messages ?? []) {
			try {
				await processMessage(
					message.Body,
					dependencies.repository,
					dependencies.now?.() ?? new Date(),
					log,
				);
				if (message.ReceiptHandle) {
					// processed 和永久 rejected 都确认消费；只有暂时失败不删除、等待重试。
					await dependencies.sqs.send(
						new DeleteMessageCommand({
							QueueUrl: dependencies.config.PERFORMANCE_QUEUE_URL,
							ReceiptHandle: message.ReceiptHandle,
						}),
					);
				}
			} catch (error) {
				// 保留 messageId 便于排障，但不输出消息正文。
				log({
					level: "error",
					message: "performance batch processing failed",
					messageId: message.MessageId,
					errorName: error instanceof Error ? error.name : "UnknownError",
				});
			}
		}
	}
}
