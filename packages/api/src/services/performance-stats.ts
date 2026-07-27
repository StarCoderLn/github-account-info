import {
	type PerformanceMetricName,
	type PerformanceOverviewInput,
	performanceMetricNames,
} from "@github-account-info/performance-schema";
import { type SQL, sql } from "drizzle-orm";

import type { Context } from "../context";

type PerformanceDatabase = Pick<Context["db"], "execute">;

type QueryResult = {
	rows?: unknown[];
};

type MetricRow = {
	metric_name: string;
	p50: string | number | null;
	p75: string | number | null;
	p95: string | number | null;
	sample_count: string | number;
};

type SummaryRow = {
	page_views: string | number;
	sessions: string | number;
	error_count: string | number;
	processing_lag_p75: string | number | null;
};

const RANGE_INTERVALS = {
	"1h": "1 hour",
	"24h": "24 hours",
	"7d": "7 days",
} as const;

const RATING_THRESHOLDS: Record<
	PerformanceMetricName,
	{ good: number; poor: number }
> = {
	LCP: { good: 2_500, poor: 4_000 },
	INP: { good: 200, poor: 500 },
	CLS: { good: 0.1, poor: 0.25 },
	FCP: { good: 1_800, poor: 3_000 },
	TTFB: { good: 800, poor: 1_800 },
};

function numberValue(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function rows(result: unknown): unknown[] {
	return (result as QueryResult).rows ?? [];
}

function rating(
	name: PerformanceMetricName,
	value: number | null,
): "good" | "needs-improvement" | "poor" | null {
	if (value === null) {
		return null;
	}
	const threshold = RATING_THRESHOLDS[name];
	if (value <= threshold.good) {
		return "good";
	}
	if (value > threshold.poor) {
		return "poor";
	}
	return "needs-improvement";
}

function filters(input: PerformanceOverviewInput): SQL {
	const conditions: SQL[] = [
		sql`app_id = 'github-account-info-web'`,
		sql`occurred_at >= NOW() - ${RANGE_INTERVALS[input.range]}::interval`,
	];
	if (input.environment) {
		conditions.push(sql`environment = ${input.environment}`);
	}
	if (input.release) {
		conditions.push(sql`release = ${input.release}`);
	}
	if (input.route) {
		conditions.push(sql`route = ${input.route}`);
	}
	return sql.join(conditions, sql` AND `);
}

export async function getPerformanceOverview(
	database: PerformanceDatabase,
	input: PerformanceOverviewInput,
) {
	const where = filters(input);
	const bucket =
		input.range === "1h"
			? sql`date_trunc('minute', occurred_at)`
			: input.range === "24h"
				? sql`date_trunc('hour', occurred_at)`
				: sql`date_trunc('day', occurred_at)`;

	const [
		metricResult,
		summaryResult,
		trendResult,
		routeResult,
		slowRequestResult,
		errorResult,
		filterResult,
	] = await Promise.all([
		database.execute(sql`
			SELECT metric_name,
				percentile_cont(0.50) WITHIN GROUP (ORDER BY metric_value) AS p50,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value) AS p75,
				percentile_cont(0.95) WITHIN GROUP (ORDER BY metric_value) AS p95,
				COUNT(*) AS sample_count
			FROM performance_event
			WHERE ${where}
				AND event_type = 'web-vital'
				AND metric_name IN ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')
			GROUP BY metric_name
		`),
		database.execute(sql`
			SELECT
				COUNT(*) FILTER (WHERE event_type = 'page-view') AS page_views,
				COUNT(DISTINCT session_id) AS sessions,
				COUNT(*) FILTER (WHERE event_type = 'error') AS error_count,
				percentile_cont(0.75) WITHIN GROUP (
					ORDER BY processing_lag_ms
				) AS processing_lag_p75
			FROM performance_event
			WHERE ${where}
		`),
		database.execute(sql`
			SELECT ${bucket} AS bucket, metric_name,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value) AS p75,
				COUNT(*) AS sample_count
			FROM performance_event
			WHERE ${where} AND event_type = 'web-vital'
			GROUP BY bucket, metric_name
			ORDER BY bucket ASC
		`),
		database.execute(sql`
			SELECT route,
				COUNT(*) FILTER (WHERE event_type = 'page-view') AS visits,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)
					FILTER (WHERE metric_name = 'LCP') AS lcp,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)
					FILTER (WHERE metric_name = 'INP') AS inp,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)
					FILTER (WHERE metric_name = 'CLS') AS cls,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)
					FILTER (WHERE metric_name = 'FCP') AS fcp,
				percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)
					FILTER (WHERE metric_name = 'TTFB') AS ttfb
			FROM performance_event
			WHERE ${where}
			GROUP BY route
			ORDER BY visits DESC, route ASC
			LIMIT 20
		`),
		database.execute(sql`
			SELECT metric_name AS name,
				percentile_cont(0.95) WITHIN GROUP (ORDER BY metric_value) AS p95,
				COUNT(*) AS sample_count
			FROM performance_event
			WHERE ${where} AND event_type = 'resource'
			GROUP BY metric_name
			ORDER BY p95 DESC
			LIMIT 10
		`),
		database.execute(sql`
			SELECT metric_name AS name, COUNT(*) AS count
			FROM performance_event
			WHERE ${where} AND event_type = 'error'
			GROUP BY metric_name
			ORDER BY count DESC
			LIMIT 10
		`),
		database.execute(sql`
			SELECT
				ARRAY_REMOVE(ARRAY_AGG(DISTINCT environment), NULL) AS environments,
				ARRAY_REMOVE(ARRAY_AGG(DISTINCT release), NULL) AS releases,
				ARRAY_REMOVE(ARRAY_AGG(DISTINCT route), NULL) AS routes
			FROM performance_event
			WHERE app_id = 'github-account-info-web'
				AND occurred_at >= NOW() - INTERVAL '7 days'
		`),
	]);

	const metricRows = rows(metricResult) as MetricRow[];
	const metricMap = new Map(metricRows.map((row) => [row.metric_name, row]));
	const metrics = performanceMetricNames.map((name) => {
		const row = metricMap.get(name);
		const p75 = numberValue(row?.p75);
		return {
			name,
			p50: numberValue(row?.p50),
			p75,
			p95: numberValue(row?.p95),
			count: numberValue(row?.sample_count) ?? 0,
			rating: rating(name, p75),
		};
	});

	const summary = (rows(summaryResult)[0] ?? {}) as Partial<SummaryRow>;
	const pageViews = numberValue(summary.page_views) ?? 0;
	const errorCount = numberValue(summary.error_count) ?? 0;

	return {
		range: input.range,
		metrics,
		summary: {
			pageViews,
			sessions: numberValue(summary.sessions) ?? 0,
			errorCount,
			errorRate: pageViews === 0 ? 0 : (errorCount / pageViews) * 100,
			processingLagP75: numberValue(summary.processing_lag_p75),
		},
		trend: (rows(trendResult) as Array<Record<string, unknown>>).map((row) => ({
			bucket: new Date(String(row.bucket)).toISOString(),
			name: row.metric_name as PerformanceMetricName,
			p75: numberValue(row.p75),
			count: numberValue(row.sample_count) ?? 0,
		})),
		routes: (rows(routeResult) as Array<Record<string, unknown>>).map(
			(row) => ({
				route: String(row.route),
				visits: numberValue(row.visits) ?? 0,
				LCP: numberValue(row.lcp),
				INP: numberValue(row.inp),
				CLS: numberValue(row.cls),
				FCP: numberValue(row.fcp),
				TTFB: numberValue(row.ttfb),
			}),
		),
		slowRequests: (
			rows(slowRequestResult) as Array<Record<string, unknown>>
		).map((row) => ({
			name: String(row.name),
			p95: numberValue(row.p95),
			count: numberValue(row.sample_count) ?? 0,
		})),
		errors: (rows(errorResult) as Array<Record<string, unknown>>).map(
			(row) => ({
				name: String(row.name),
				count: numberValue(row.count) ?? 0,
			}),
		),
		filters: {
			environments: ((
				rows(filterResult)[0] as Record<string, unknown> | undefined
			)?.environments ?? []) as string[],
			releases: ((rows(filterResult)[0] as Record<string, unknown> | undefined)
				?.releases ?? []) as string[],
			routes: ((rows(filterResult)[0] as Record<string, unknown> | undefined)
				?.routes ?? []) as string[],
		},
	};
}
