import assert from "node:assert/strict";
import test from "node:test";

import { getPerformanceOverview } from "./performance-stats";

test("always returns all five metrics and classifies p75", async () => {
	const responses = [
		{
			rows: [
				{
					metric_name: "LCP",
					p50: 1200,
					p75: 2600,
					p95: 4300,
					sample_count: 12,
				},
				{
					metric_name: "CLS",
					p50: 0.03,
					p75: 0.08,
					p95: 0.2,
					sample_count: 9,
				},
			],
		},
		{
			rows: [
				{
					page_views: 10,
					sessions: 8,
					error_count: 2,
					processing_lag_p75: 320,
				},
			],
		},
		{ rows: [] },
		{ rows: [] },
		{ rows: [] },
		{ rows: [] },
		{ rows: [{ environments: [], releases: [], routes: [] }] },
	];
	let index = 0;
	const database = {
		execute: async () => responses[index++],
	};
	const overview = await getPerformanceOverview(database as never, {
		range: "24h",
	});

	assert.deepEqual(
		overview.metrics.map((metric) => metric.name),
		["LCP", "INP", "CLS", "FCP", "TTFB"],
	);
	assert.equal(overview.metrics[0]?.rating, "needs-improvement");
	assert.equal(overview.metrics[1]?.p75, null);
	assert.equal(overview.metrics[2]?.rating, "good");
	assert.equal(overview.summary.errorRate, 20);
});
