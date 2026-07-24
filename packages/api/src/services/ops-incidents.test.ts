import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	loadOpsServiceConfig,
	OpsNotConfiguredError,
	parseStoredOpsIncident,
} from "./ops-incidents";

describe("AI Ops service configuration", () => {
	it("stays explicitly disabled when AWS resources are not configured", () => {
		assert.throws(
			() => loadOpsServiceConfig({}),
			(error) => error instanceof OpsNotConfiguredError,
		);
	});

	it("loads only the configured table and queue", () => {
		assert.deepEqual(
			loadOpsServiceConfig({
				AI_OPS_INCIDENT_TABLE: "incidents",
				AI_OPS_QUEUE_URL:
					"https://sqs.us-east-2.amazonaws.com/123456789012/incidents",
			}),
			{
				tableName: "incidents",
				queueUrl: "https://sqs.us-east-2.amazonaws.com/123456789012/incidents",
			},
		);
	});
});

describe("stored AI Ops incident compatibility", () => {
	const legacyIncident = {
		schemaVersion: 1,
		incidentId: "c82325d2-d76a-4a34-be45-77e0c5853d93",
		projectKey: "PROJECT#github-account-info",
		createdKey: "2026-07-24T12:00:00.000Z#c82325d2-d76a-4a34-be45-77e0c5853d93",
		dedupeKey: "MANUAL#c82325d2-d76a-4a34-be45-77e0c5853d93",
		source: "manual",
		status: "investigating",
		title: "Manual investigation: node-api",
		createdAt: "2026-07-24T12:00:00.000Z",
		updatedAt: "2026-07-24T12:01:00.000Z",
		expiresAt: 1_776_000_000,
		alarmContext: null,
		manualContext: {
			component: "node-api",
			reason: "Investigate elevated error rate",
		},
		investigation: null,
	};

	it("normalizes a missing legacy failure field to null", () => {
		const incident = parseStoredOpsIncident(legacyIncident);
		assert.equal(incident.failure, null);
	});

	it("still rejects malformed stored failure values", () => {
		assert.throws(() =>
			parseStoredOpsIncident({
				...legacyIncident,
				failure: "invalid",
			}),
		);
	});
});
