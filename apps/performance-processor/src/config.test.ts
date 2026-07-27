import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config";

const requiredConfig = {
	AWS_REGION: "us-east-2",
	PERFORMANCE_QUEUE_URL:
		"https://sqs.us-east-2.amazonaws.com/123456789012/performance-events",
	DATABASE_URL: "postgresql://user:password@example.test/database",
	RDS_CA_BUNDLE: "/app/certs/rds-bundle.pem",
};

test("defaults to processor mode", () => {
	assert.equal(
		loadConfig(requiredConfig).PERFORMANCE_PROCESSOR_MODE,
		"processor",
	);
});

test("accepts one-off migration mode", () => {
	assert.equal(
		loadConfig({
			...requiredConfig,
			PERFORMANCE_PROCESSOR_MODE: "migrate",
		}).PERFORMANCE_PROCESSOR_MODE,
		"migrate",
	);
});

test("rejects unknown modes", () => {
	assert.throws(() =>
		loadConfig({
			...requiredConfig,
			PERFORMANCE_PROCESSOR_MODE: "shell",
		}),
	);
});
