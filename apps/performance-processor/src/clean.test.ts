import assert from "node:assert/strict";
import test from "node:test";

import type { PerformanceEvent } from "@github-account-info/performance-schema";

import {
	cleanPerformanceEvent,
	PermanentPerformanceEventError,
	redactText,
} from "./clean";

const event: PerformanceEvent = {
	schemaVersion: 1,
	eventId: "7f0f17d5-beb1-4cc2-a2a4-441cf98da769",
	occurredAt: "2026-07-27T10:00:00.000Z",
	appId: "github-account-info-web",
	environment: "production",
	release: "prod-abcdef1",
	sessionId: "432d9fb5-b0fe-45f3-a666-33e4f74377b4",
	route: "/u/alice",
	type: "error",
	name: "FetchError",
	message: "Authorization: Bearer abc.def.ghi",
};

test("normalizes routes and redacts credential-like error text", () => {
	const result = cleanPerformanceEvent(
		event,
		new Date("2026-07-27T10:00:02.000Z"),
	);
	assert.equal(result.route, "/u/:username");
	assert.equal(result.message?.includes("Bearer"), false);
	assert.equal(result.processingLagMs, 2_000);
});

test("rejects events outside the retention window", () => {
	assert.throws(
		() => cleanPerformanceEvent(event, new Date("2026-08-27T10:00:00.000Z")),
		PermanentPerformanceEventError,
	);
});

test("redaction truncates multiline content", () => {
	assert.equal(redactText("token=secret\nnext").includes("secret"), false);
});
