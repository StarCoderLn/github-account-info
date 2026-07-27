import {
	SendMessageCommand,
	SQSClient,
	type SQSClientConfig,
} from "@aws-sdk/client-sqs";
import {
	type PerformanceBatch,
	performanceBatchSchema,
} from "@github-account-info/performance-schema";

export type PerformanceQueue = {
	send(batch: PerformanceBatch): Promise<void>;
};

// 用最小接口隔离 AWS SDK，单元测试无需连接真实 SQS。
type SqsSender = {
	send(command: SendMessageCommand): Promise<unknown>;
};

export class PerformanceIngestDisabledError extends Error {
	override name = "PerformanceIngestDisabledError";
}

export class InvalidPerformanceBatchError extends Error {
	override name = "InvalidPerformanceBatchError";
}

export function createSqsPerformanceQueue(
	queueUrl: string,
	clientConfig: SQSClientConfig = {},
): PerformanceQueue {
	const client: SqsSender = new SQSClient(clientConfig);
	return createSqsPerformanceQueueWithClient(queueUrl, client);
}

export function createSqsPerformanceQueueWithClient(
	queueUrl: string,
	client: SqsSender,
): PerformanceQueue {
	return {
		async send(batch) {
			// 一个 SQS message 对应一个已校验 batch，processor 可按批次原子入库和重试。
			await client.send(
				new SendMessageCommand({
					QueueUrl: queueUrl,
					MessageBody: JSON.stringify(batch),
				}),
			);
		},
	};
}

export async function ingestPerformanceBatch(
	input: unknown,
	queue: PerformanceQueue | null,
): Promise<{ accepted: number }> {
	if (!queue) {
		throw new PerformanceIngestDisabledError(
			"performance ingestion is not configured",
		);
	}
	// 浏览器输入不可信；只有共享契约校验通过的数据才允许进入异步链路。
	const result = performanceBatchSchema.safeParse(input);
	if (!result.success) {
		throw new InvalidPerformanceBatchError("invalid performance event batch");
	}
	await queue.send(result.data);
	// accepted 是成功入队的事件数，不代表这些事件已经清洗或写入数据库。
	return { accepted: result.data.events.length };
}
