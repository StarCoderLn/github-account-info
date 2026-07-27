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
					await dependencies.sqs.send(
						new DeleteMessageCommand({
							QueueUrl: dependencies.config.PERFORMANCE_QUEUE_URL,
							ReceiptHandle: message.ReceiptHandle,
						}),
					);
				}
			} catch (error) {
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
