import { createHash } from "node:crypto";
import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
	cloudWatchAlarmEventSchema,
	type OpsIncident,
} from "@github-account-info/ai-ops-schema";
import type { EventBridgeHandler } from "aws-lambda";

function stableUuid(value: string): string {
	const bytes = createHash("sha256")
		.update(value)
		.digest("hex")
		.slice(0, 32)
		.split("");
	bytes[12] = "4";
	bytes[16] = ((Number.parseInt(bytes[16] ?? "0", 16) & 3) | 8).toString(16);
	const hex = bytes.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

export const handler: EventBridgeHandler<
	"CloudWatch Alarm State Change",
	unknown,
	void
> = async (event) => {
	const alarmEvent = cloudWatchAlarmEventSchema.parse(event);
	const createdAt = alarmEvent.detail.state.timestamp;
	const dedupeWindow = Math.floor(new Date(createdAt).getTime() / 300_000);
	const dedupeKey = `${alarmEvent.detail.alarmName}#${dedupeWindow}`;
	const incidentId = stableUuid(dedupeKey);
	const incident: OpsIncident = {
		schemaVersion: 1,
		incidentId,
		projectKey: "PROJECT#github-account-info",
		createdKey: `${createdAt}#${incidentId}`,
		dedupeKey: `ALARM_WINDOW#${dedupeKey}`,
		source: "cloudwatch-alarm",
		status: "queued",
		title: `CloudWatch alarm: ${alarmEvent.detail.alarmName}`,
		createdAt,
		updatedAt: createdAt,
		expiresAt: Math.floor(new Date(createdAt).getTime() / 1_000) + 30 * 86_400,
		alarmContext: {
			alarmName: alarmEvent.detail.alarmName,
			alarmArn: alarmEvent.resources[0] ?? "unknown",
			region: alarmEvent.region,
			occurredAt: createdAt,
			reason: alarmEvent.detail.state.reason,
		},
		manualContext: null,
		investigation: null,
		failure: null,
	};

	try {
		await documentClient.send(
			new PutCommand({
				TableName: process.env.AI_OPS_INCIDENT_TABLE,
				Item: incident,
				ConditionExpression: "attribute_not_exists(incidentId)",
			}),
		);
	} catch (error) {
		if (!(error instanceof ConditionalCheckFailedException)) throw error;
	}

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: process.env.AI_OPS_QUEUE_URL,
			MessageBody: JSON.stringify({ schemaVersion: 1, incidentId }),
		}),
	);
};
