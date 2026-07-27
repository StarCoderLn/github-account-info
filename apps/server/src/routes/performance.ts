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

/**
 * 浏览器性能事件的公开接入路由。
 *
 * 该入口只做体积限制、协议校验和入队，不在 HTTP 请求中同步访问数据库。
 * queue 参数可注入，既便于路由测试，也让“未配置采集链路”具有明确的 503 语义。
 */
export function createPerformanceRoutes(
	queue: PerformanceQueue | null = env.PERFORMANCE_QUEUE_URL
		? createSqsPerformanceQueue(env.PERFORMANCE_QUEUE_URL)
		: null,
) {
	const routes = new Hono();

	routes.post(
		"/events",
		// 在 JSON 解析前拒绝超大请求，避免匿名入口占用不受控的内存。
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
				// 202 只表示批次已被 SQS 接受；清洗和持久化仍由异步 processor 完成。
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
				// 日志只记录错误类型，禁止输出可能含 URL、错误消息或凭证的原始 body。
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
