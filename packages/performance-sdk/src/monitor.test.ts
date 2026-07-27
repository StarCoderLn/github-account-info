import assert from "node:assert/strict";
import test from "node:test";

import type { PerformanceBatch } from "@github-account-info/performance-schema";

import { createPerformanceMonitor } from "./monitor";

test("tracks an explicit SPA route without retaining query or fragment", async () => {
	const batches: PerformanceBatch[] = [];
	const windowTarget = Object.assign(new EventTarget(), {
		location: { href: "https://example.com/" },
		navigator: {},
	});
	const documentTarget = Object.assign(new EventTarget(), {
		visibilityState: "visible",
	});
	const monitor = createPerformanceMonitor(
		{
			endpoint: "https://api.example.com/api/v1/performance/events",
			appId: "test-web",
			environment: "test",
			release: "test-release",
			trackInitialPageView: false,
		},
		{
			window: windowTarget as unknown as Window,
			document: documentTarget as unknown as Document,
			performance: {
				getEntriesByType: () => [{ duration: 120 }],
			} as unknown as Performance,
			fetch: async (_input, init) => {
				batches.push(JSON.parse(String(init?.body)) as PerformanceBatch);
				return new Response(null, { status: 202 });
			},
		},
	);

	monitor.trackPageView("https://example.com/accounts/42?token=secret#details");
	await monitor.flush();

	assert.equal(batches.length, 1);
	assert.equal(batches[0]?.events.length, 1);
	assert.deepEqual(batches[0]?.events[0], {
		...batches[0]?.events[0],
		type: "page-view",
		name: "page-load",
		route: "/accounts/:id",
		value: 120,
		unit: "ms",
	});
});
