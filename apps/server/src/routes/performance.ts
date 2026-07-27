import {
	createSqsPerformanceQueue,
	InvalidPerformanceBatchError,
	ingestPerformanceBatch,
	PerformanceIngestDisabledError,
	type PerformanceQueue,
} from "@github-account-info/api/services/performance-ingest";
import { env } from "@github-account-info/env/server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const MAX_BODY_SIZE = 64 * 1024;

export function createPerformanceRoutes(
	queue: PerformanceQueue | null = env.PERFORMANCE_QUEUE_URL
		? createSqsPerformanceQueue(env.PERFORMANCE_QUEUE_URL)
		: null,
) {
	const routes = new Hono();

	routes.post(
		"/events",
		bodyLimit({
			maxSize: MAX_BODY_SIZE,
			onError: (context) =>
				context.json(
					{
						error: {
							code: "PERFORMANCE_BATCH_TOO_LARGE",
							message: "performance event batch exceeds 64 KiB",
						},
					},
					413,
				),
		}),
		async (context) => {
			let body: unknown;
			try {
				body = await context.req.json();
			} catch {
				return context.json(
					{
						error: {
							code: "INVALID_JSON",
							message: "request body must be valid JSON",
						},
					},
					400,
				);
			}

			try {
				const result = await ingestPerformanceBatch(body, queue);
				return context.json(result, 202);
			} catch (error) {
				if (error instanceof InvalidPerformanceBatchError) {
					return context.json(
						{
							error: {
								code: "INVALID_PERFORMANCE_BATCH",
								message: error.message,
							},
						},
						400,
					);
				}
				if (error instanceof PerformanceIngestDisabledError) {
					return context.json(
						{
							error: {
								code: "PERFORMANCE_INGEST_DISABLED",
								message: "performance ingestion is unavailable",
							},
						},
						503,
					);
				}
				console.error(
					JSON.stringify({
						level: "error",
						message: "performance batch enqueue failed",
						errorName: error instanceof Error ? error.name : "UnknownError",
					}),
				);
				return context.json(
					{
						error: {
							code: "PERFORMANCE_INGEST_FAILED",
							message: "performance event batch could not be accepted",
						},
					},
					503,
				);
			}
		},
	);

	return routes;
}
