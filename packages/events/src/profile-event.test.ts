import assert from "node:assert/strict";
import test from "node:test";

import {
	createIntroductionReadyEvent,
	profileEventSchema,
} from "./profile-event";

test("creates a deterministic, credential-free introduction event", () => {
	const event = createIntroductionReadyEvent({
		githubId: 5_834_231,
		githubUsername: "octocat",
		generatorVersion: "template-v1",
		generatedAt: "2026-07-22T08:30:00Z",
		generated: true,
	});

	assert.equal(
		event.eventId,
		"introduction.ready:5834231:template-v1:2026-07-22T08:30:00Z",
	);
	assert.deepEqual(Object.keys(event).sort(), [
		"eventId",
		"eventType",
		"generated",
		"generatedAt",
		"generatorVersion",
		"githubId",
		"githubUsername",
		"schemaVersion",
	]);
});

test("rejects unsupported schema versions", () => {
	const result = profileEventSchema.safeParse({
		eventId: "poison-event",
		eventType: "introduction.ready",
		schemaVersion: 999,
		githubId: 1,
		githubUsername: "octocat",
		generatorVersion: "template-v1",
		generatedAt: "2026-07-22T08:30:00Z",
		generated: true,
	});

	assert.equal(result.success, false);
});
