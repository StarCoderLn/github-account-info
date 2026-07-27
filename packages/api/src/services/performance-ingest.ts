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
	const result = performanceBatchSchema.safeParse(input);
	if (!result.success) {
		throw new InvalidPerformanceBatchError("invalid performance event batch");
	}
	await queue.send(result.data);
	return { accepted: result.data.events.length };
}
