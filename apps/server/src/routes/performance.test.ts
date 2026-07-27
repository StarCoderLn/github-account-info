import assert from "node:assert/strict";
import test from "node:test";

import type { PerformanceBatch } from "@github-account-info/performance-schema";

import { createPerformanceRoutes } from "./performance";

const validBatch: PerformanceBatch = {
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

test("returns 202 after a valid batch is queued", async () => {
	let queued = false;
	const app = createPerformanceRoutes({
		async send() {
			queued = true;
		},
	});
	const response = await app.request("/events", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(validBatch),
	});
	assert.equal(response.status, 202);
	assert.equal(queued, true);
	assert.deepEqual(await response.json(), { accepted: 1 });
});

test("returns 400 without reflecting an invalid body", async () => {
	const app = createPerformanceRoutes({
		async send() {
			assert.fail("queue must not be called");
		},
	});
	const response = await app.request("/events", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token: "do-not-reflect" }),
	});
	assert.equal(response.status, 400);
	assert.equal((await response.text()).includes("do-not-reflect"), false);
});
