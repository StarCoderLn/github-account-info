import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { DynamoIncidentRepository } from "./incident-repository";

describe("DynamoIncidentRepository", () => {
	it("preserves failure as null while an incident is investigating", async () => {
		let command: UpdateCommand | undefined;
		const client = {
			send: async (value: UpdateCommand) => {
				command = value;
				return {};
			},
		};
		const repository = new DynamoIncidentRepository("incidents", client as never);

		await repository.begin(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-07-24T00:01:00.000Z",
		);

		assert.equal(
			command?.input.ExpressionAttributeValues?.[":emptyFailure"],
			null,
		);
		assert.doesNotMatch(command?.input.UpdateExpression ?? "", /REMOVE failure/);
	});
});
