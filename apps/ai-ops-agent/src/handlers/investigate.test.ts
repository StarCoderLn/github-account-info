import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
	Investigation,
	OpsIncident,
} from "@github-account-info/ai-ops-schema";
import type { SQSEvent } from "aws-lambda";

import type { Investigator } from "../agent/agent";
import type { IncidentRepository } from "../storage/incident-repository";
import { createInvestigateHandler } from "./investigate";

const incident: OpsIncident = {
	schemaVersion: 1,
	incidentId: "550e8400-e29b-41d4-a716-446655440000",
	projectKey: "PROJECT#github-account-info",
	createdKey: "2026-07-24T00:00:00.000Z#550e8400-e29b-41d4-a716-446655440000",
	dedupeKey: "manual:test",
	source: "manual",
	status: "queued",
	title: "Test incident",
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
	expiresAt: 1_800_000_000,
	alarmContext: null,
	manualContext: { component: "node-api", reason: "Test elevated errors" },
	investigation: null,
	failure: null,
};

const investigation: Investigation = {
	schemaVersion: 1,
	generatedAt: "2026-07-24T00:01:00.000Z",
	modelProvider: "fake",
	modelId: "fake",
	summary: "No fault found",
	severity: "low",
	rootCause: null,
	confidence: 0.2,
	hypotheses: [
		{
			summary: "Transient signal",
			confidence: 0.2,
			supportingEvidenceIds: ["incident-context"],
			contradictingEvidenceIds: [],
		},
	],
	evidence: [
		{
			evidenceId: "incident-context",
			source: "cloudwatch",
			resource: "manual:node-api",
			observedAt: "2026-07-24T00:00:00.000Z",
			observation: "Test elevated errors",
		},
	],
	recommendations: [],
};

function event(body: string): SQSEvent {
	return {
		Records: [
			{
				messageId: "message-1",
				receiptHandle: "",
				body,
				attributes: {} as never,
				messageAttributes: {},
				md5OfBody: "",
				eventSource: "aws:sqs",
				eventSourceARN: "",
				awsRegion: "us-east-2",
			},
		],
	};
}

describe("investigate handler", () => {
	it("completes an incident and acknowledges the record", async () => {
		let completed = false;
		const repository: IncidentRepository = {
			get: async () => incident,
			begin: async () => true,
			complete: async (_id, value) => {
				completed = value.summary === investigation.summary;
			},
			fail: async () => {},
		};
		const investigator: Investigator = {
			investigate: async () => investigation,
		};
		const handler = createInvestigateHandler({ repository, investigator });

		const response = await handler(
			event(
				JSON.stringify({ schemaVersion: 1, incidentId: incident.incidentId }),
			),
		);

		assert.equal(completed, true);
		assert.deepEqual(response.batchItemFailures, []);
	});

	it("acknowledges malformed records without invoking the model", async () => {
		let invoked = false;
		const repository = {} as IncidentRepository;
		const investigator: Investigator = {
			investigate: async () => {
				invoked = true;
				return investigation;
			},
		};
		const handler = createInvestigateHandler({ repository, investigator });

		const response = await handler(event("not-json"));

		assert.equal(invoked, false);
		assert.deepEqual(response.batchItemFailures, []);
	});

	it("returns transient failures for SQS partial retry", async () => {
		const repository: IncidentRepository = {
			get: async () => incident,
			begin: async () => true,
			complete: async () => {},
			fail: async () => {},
		};
		const investigator: Investigator = {
			investigate: async () => {
				throw new Error("rate limited");
			},
		};
		const handler = createInvestigateHandler({ repository, investigator });

		const response = await handler(
			event(
				JSON.stringify({ schemaVersion: 1, incidentId: incident.incidentId }),
			),
		);

		assert.deepEqual(response.batchItemFailures, [
			{ itemIdentifier: "message-1" },
		]);
	});
});
