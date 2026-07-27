import assert from "node:assert/strict";
import test from "node:test";

import {
	performanceBatchSchema,
	performanceEventSchema,
	performanceMetricNames,
} from "./index";

const base = {
	schemaVersion: 1 as const,
	eventId: "7f0f17d5-beb1-4cc2-a2a4-441cf98da769",
	occurredAt: "2026-07-27T10:00:00.000Z",
	appId: "github-account-info-web",
	environment: "production",
	release: "prod-abcdef1",
	sessionId: "432d9fb5-b0fe-45f3-a666-33e4f74377b4",
	route: "/accounts",
};

test("accepts all five Web Vitals with the required units", () => {
	for (const name of performanceMetricNames) {
		const result = performanceEventSchema.safeParse({
			...base,
			type: "web-vital",
			name,
			value: name === "CLS" ? 0.05 : 820,
			unit: name === "CLS" ? "score" : "ms",
		});
		assert.equal(result.success, true, name);
	}
});

test("rejects query strings and mismatched CLS units", () => {
	const result = performanceEventSchema.safeParse({
		...base,
		route: "/accounts?token=secret",
		type: "web-vital",
		name: "CLS",
		value: 0.05,
		unit: "ms",
	});
	assert.equal(result.success, false);
});

test("limits a network batch to fifty events", () => {
	const event = {
		...base,
		type: "web-vital" as const,
		name: "LCP" as const,
		value: 820,
		unit: "ms" as const,
	};
	assert.equal(
		performanceBatchSchema.safeParse({
			schemaVersion: 1,
			events: Array.from({ length: 51 }, (_, index) => ({
				...event,
				eventId: `7f0f17d5-beb1-4cc2-a2a4-${String(index).padStart(12, "0")}`,
			})),
		}).success,
		false,
	);
});
