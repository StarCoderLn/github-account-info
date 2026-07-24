import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
	type CreateManualIncidentInput,
	incidentSchema,
	type OpsIncident,
} from "@github-account-info/ai-ops-schema";

export class OpsNotConfiguredError extends Error {
	constructor() {
		super("AI Ops 尚未配置，请先部署 infra/ai-ops.yaml 并设置运行时环境变量");
		this.name = "OpsNotConfiguredError";
	}
}

export interface OpsServiceConfig {
	tableName: string;
	queueUrl: string;
}

export function loadOpsServiceConfig(
	environment: NodeJS.ProcessEnv = process.env,
): OpsServiceConfig {
	const tableName = environment.AI_OPS_INCIDENT_TABLE;
	const queueUrl = environment.AI_OPS_QUEUE_URL;
	if (!tableName || !queueUrl) throw new OpsNotConfiguredError();
	return { tableName, queueUrl };
}

export class OpsIncidentService {
	constructor(
		private readonly config: OpsServiceConfig,
		private readonly documentClient = DynamoDBDocumentClient.from(
			new DynamoDBClient({}),
		),
		private readonly sqs = new SQSClient({}),
	) {}

	async list(limit: number, cursor?: string) {
		const exclusiveStartKey = cursor
			? (JSON.parse(
					Buffer.from(cursor, "base64url").toString("utf8"),
				) as Record<string, unknown>)
			: undefined;
		const result = await this.documentClient.send(
			new QueryCommand({
				TableName: this.config.tableName,
				IndexName: "by-created-at",
				KeyConditionExpression: "projectKey = :projectKey",
				ExpressionAttributeValues: {
					":projectKey": "PROJECT#github-account-info",
				},
				ScanIndexForward: false,
				Limit: limit,
				ExclusiveStartKey: exclusiveStartKey,
			}),
		);
		return {
			items: (result.Items ?? []).map((item) => incidentSchema.parse(item)),
			nextCursor: result.LastEvaluatedKey
				? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
						"base64url",
					)
				: null,
		};
	}

	async get(incidentId: string): Promise<OpsIncident | null> {
		const result = await this.documentClient.send(
			new GetCommand({
				TableName: this.config.tableName,
				Key: { incidentId },
			}),
		);
		return result.Item ? incidentSchema.parse(result.Item) : null;
	}

	async create(input: CreateManualIncidentInput): Promise<OpsIncident> {
		const incidentId = randomUUID();
		const now = new Date();
		const createdAt = now.toISOString();
		const incident: OpsIncident = {
			schemaVersion: 1,
			incidentId,
			projectKey: "PROJECT#github-account-info",
			createdKey: `${createdAt}#${incidentId}`,
			dedupeKey: `MANUAL#${incidentId}`,
			source: "manual",
			status: "queued",
			title: `Manual investigation: ${input.component}`,
			createdAt,
			updatedAt: createdAt,
			expiresAt: Math.floor(now.getTime() / 1_000) + 30 * 86_400,
			alarmContext: null,
			manualContext: input,
			investigation: null,
			failure: null,
		};
		await this.documentClient.send(
			new PutCommand({
				TableName: this.config.tableName,
				Item: incident,
				ConditionExpression: "attribute_not_exists(incidentId)",
			}),
		);
		try {
			await this.sqs.send(
				new SendMessageCommand({
					QueueUrl: this.config.queueUrl,
					MessageBody: JSON.stringify({ schemaVersion: 1, incidentId }),
				}),
			);
		} catch (error) {
			await this.documentClient.send(
				new UpdateCommand({
					TableName: this.config.tableName,
					Key: { incidentId },
					UpdateExpression:
						"SET #status = :failed, failure = :failure, updatedAt = :updatedAt",
					ExpressionAttributeNames: { "#status": "status" },
					ExpressionAttributeValues: {
						":failed": "failed",
						":updatedAt": new Date().toISOString(),
						":failure": {
							code: "INVESTIGATION_FAILED",
							message: "Failed to enqueue investigation",
							failedAt: new Date().toISOString(),
							retryable: true,
						},
					},
				}),
			);
			throw error;
		}
		return incident;
	}
}
