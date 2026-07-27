import assert from "node:assert/strict";
import test from "node:test";

import type { PerformanceBatch } from "@github-account-info/performance-schema";

import {
	InvalidPerformanceBatchError,
	ingestPerformanceBatch,
	PerformanceIngestDisabledError,
	type PerformanceQueue,
} from "./performance-ingest";

const batch: PerformanceBatch = {
	schemaVersion: 1,
	events: [
		{
			schemaVersion: 1,
			eventId: "7f0f17d5-beb1-4cc2-a2a4-441cf98da769",
			occurredAt: "2026-07-27T10:00:00.000Z",
			appId: "github-account-info-web",
			environment: "production",
			release: "prod-abcdef1",
			sessionId: "432d9fb5-b0fe-45f3-a666-33e4f74377b4",
			route: "/accounts",
			type: "web-vital",
			name: "LCP",
			value: 1200,
			unit: "ms",
		},
	],
};

test("validates and sends one batch", async () => {
	const sent: PerformanceBatch[] = [];
	const queue: PerformanceQueue = {
		async send(value) {
			sent.push(value);
		},
	};
	assert.deepEqual(await ingestPerformanceBatch(batch, queue), { accepted: 1 });
	assert.equal(sent.length, 1);
});

test("rejects invalid batches before queue access", async () => {
	const queue: PerformanceQueue = {
		async send() {
			assert.fail("queue must not be called");
		},
	};
	await assert.rejects(
		ingestPerformanceBatch({ schemaVersion: 1, events: [] }, queue),
		InvalidPerformanceBatchError,
	);
});

test("fails explicitly when the AWS queue is disabled", async () => {
	await assert.rejects(
		ingestPerformanceBatch(batch, null),
		PerformanceIngestDisabledError,
	);
});
