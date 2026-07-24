import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadOpsServiceConfig, OpsNotConfiguredError } from "./ops-incidents";

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
