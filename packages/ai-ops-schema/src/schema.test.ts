import assert from "node:assert/strict";
import test from "node:test";

import {
	cloudWatchAlarmEventSchema,
	incidentSchema,
	investigationQueueEventSchema,
	investigationSchema,
} from "./index";

const evidence = {
	evidenceId: "queue-depth",
	source: "sqs",
	resource: "github-account-info-profile-events-dlq",
	observedAt: "2026-07-24T10:01:00Z",
	observation: "DLQ has one visible message.",
} as const;

const investigation = {
	schemaVersion: 1,
	generatedAt: "2026-07-24T10:02:00Z",
	modelProvider: "github-models",
	modelId: "publisher/model",
	summary: "The publication verifier exhausted its retries.",
	severity: "medium",
	rootCause: "The public introduction remained unavailable.",
	confidence: 0.91,
	hypotheses: [
		{
			summary: "The verifier repeatedly received a non-success response.",
			confidence: 0.91,
			supportingEvidenceIds: ["queue-depth"],
			contradictingEvidenceIds: [],
		},
	],
	evidence: [evidence],
	recommendations: [
		{
			summary: "Inspect the publication event before redriving it.",
			risk: "low",
			approvalRequired: true,
			remediationType: "manual-investigation",
		},
	],
} as const;

test("accepts a bounded investigation whose hypotheses reference known evidence", () => {
	assert.equal(investigationSchema.parse(investigation).confidence, 0.91);
});

test("rejects hallucinated evidence references", () => {
	const result = investigationSchema.safeParse({
		...investigation,
		hypotheses: [
			{
				...investigation.hypotheses[0],
				supportingEvidenceIds: ["missing-evidence"],
			},
		],
	});

	assert.equal(result.success, false);
});

test("incident schema rejects credential-shaped extra fields", () => {
	const result = incidentSchema.safeParse({
		schemaVersion: 1,
		incidentId: "7e39419a-c786-46de-9c47-73c17b0905dc",
		projectKey: "PROJECT#github-account-info",
		createdKey: "2026-07-24T10:00:00Z#7e39419a-c786-46de-9c47-73c17b0905dc",
		dedupeKey: "manual#go-api#2026-07-24T10:00",
		source: "manual",
		status: "queued",
		title: "Investigate Go readiness",
		createdAt: "2026-07-24T10:00:00Z",
		updatedAt: "2026-07-24T10:00:00Z",
		expiresAt: 1_777_070_400,
		alarmContext: null,
		manualContext: {
			component: "go-api",
			reason: "Readiness returned 503.",
		},
		investigation: null,
		failure: null,
		token: "must-not-cross-the-boundary",
	});

	assert.equal(result.success, false);
});

test("queue event contains only the version and incident id", () => {
	const event = investigationQueueEventSchema.parse({
		schemaVersion: 1,
		incidentId: "7e39419a-c786-46de-9c47-73c17b0905dc",
	});

	assert.deepEqual(Object.keys(event).sort(), ["incidentId", "schemaVersion"]);
});

test("accepts only ALARM state changes from CloudWatch", () => {
	const baseEvent = {
		version: "0",
		id: "event-id",
		"detail-type": "CloudWatch Alarm State Change",
		source: "aws.cloudwatch",
		account: "123456789012",
		time: "2026-07-24T10:00:00Z",
		region: "us-east-2",
		resources: ["arn:aws:cloudwatch:us-east-2:123456789012:alarm:example"],
		detail: {
			alarmName: "example",
			state: {
				value: "ALARM",
				reason: "Threshold crossed",
				timestamp: "2026-07-24T10:00:00Z",
			},
		},
	};

	assert.equal(cloudWatchAlarmEventSchema.safeParse(baseEvent).success, true);
	assert.equal(
		cloudWatchAlarmEventSchema.safeParse({
			...baseEvent,
			detail: {
				...baseEvent.detail,
				state: { ...baseEvent.detail.state, value: "OK" },
			},
		}).success,
		false,
	);
});
