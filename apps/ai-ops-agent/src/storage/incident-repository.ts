import {
	ConditionalCheckFailedException,
	DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	GetCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
	type Investigation,
	incidentSchema,
	type OpsIncident,
} from "@github-account-info/ai-ops-schema";

export interface IncidentRepository {
	get(incidentId: string): Promise<OpsIncident | null>;
	begin(incidentId: string, updatedAt: string): Promise<boolean>;
	complete(
		incidentId: string,
		investigation: Investigation,
		updatedAt: string,
	): Promise<void>;
	fail(
		incidentId: string,
		failure: NonNullable<OpsIncident["failure"]>,
		updatedAt: string,
	): Promise<void>;
}

export class DynamoIncidentRepository implements IncidentRepository {
	constructor(
		private readonly tableName: string,
		private readonly client = DynamoDBDocumentClient.from(
			new DynamoDBClient({}),
		),
	) {}

	async get(incidentId: string): Promise<OpsIncident | null> {
		const result = await this.client.send(
			new GetCommand({
				TableName: this.tableName,
				Key: { incidentId },
				ConsistentRead: true,
			}),
		);
		return result.Item ? incidentSchema.parse(result.Item) : null;
	}

	async begin(incidentId: string, updatedAt: string): Promise<boolean> {
		try {
			await this.client.send(
				new UpdateCommand({
					TableName: this.tableName,
					Key: { incidentId },
					UpdateExpression:
						"SET #status = :investigating, updatedAt = :updatedAt, failure = :emptyFailure",
					ConditionExpression:
						"attribute_exists(incidentId) AND #status IN (:queued, :investigating)",
					ExpressionAttributeNames: { "#status": "status" },
					ExpressionAttributeValues: {
						":queued": "queued",
						":investigating": "investigating",
						":updatedAt": updatedAt,
						":emptyFailure": null,
					},
				}),
			);
			return true;
		} catch (error) {
			if (error instanceof ConditionalCheckFailedException) return false;
			throw error;
		}
	}

	async complete(
		incidentId: string,
		investigation: Investigation,
		updatedAt: string,
	): Promise<void> {
		await this.client.send(
			new UpdateCommand({
				TableName: this.tableName,
				Key: { incidentId },
				UpdateExpression:
					"SET #status = :completed, investigation = :investigation, updatedAt = :updatedAt, failure = :emptyFailure",
				ConditionExpression: "#status = :investigating",
				ExpressionAttributeNames: { "#status": "status" },
				ExpressionAttributeValues: {
					":completed": "completed",
					":investigating": "investigating",
					":investigation": investigation,
					":updatedAt": updatedAt,
					":emptyFailure": null,
				},
			}),
		);
	}

	async fail(
		incidentId: string,
		failure: NonNullable<OpsIncident["failure"]>,
		updatedAt: string,
	): Promise<void> {
		await this.client.send(
			new UpdateCommand({
				TableName: this.tableName,
				Key: { incidentId },
				UpdateExpression:
					"SET #status = :failed, failure = :failure, updatedAt = :updatedAt",
				ConditionExpression: "attribute_exists(incidentId)",
				ExpressionAttributeNames: { "#status": "status" },
				ExpressionAttributeValues: {
					":failed": "failed",
					":failure": failure,
					":updatedAt": updatedAt,
				},
			}),
		);
	}
}
