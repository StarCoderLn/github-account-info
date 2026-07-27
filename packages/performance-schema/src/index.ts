import { z } from "zod";

/**
 * Performance 全链路共享契约。
 *
 * 浏览器 SDK 只通过 `import type` 使用本包，避免把 Zod 打入监控 chunk；
 * Node 接收层与 ECS processor 则在运行时使用这些 schema 做两次独立校验。
 */
export const PERFORMANCE_SCHEMA_VERSION = 1 as const;
// HTTP 单批上限大于 SDK 默认批量，给重试和其他受信客户端保留空间。
export const PERFORMANCE_BATCH_MAX_EVENTS = 50;
export const PERFORMANCE_SDK_BATCH_SIZE = 20;
// 浏览器内存队列必须有界，监控链路不可反过来拖垮被监控页面。
export const PERFORMANCE_SDK_QUEUE_LIMIT = 100;

export const performanceMetricNames = [
	"LCP",
	"INP",
	"CLS",
	"FCP",
	"TTFB",
] as const;

export const performanceMetricNameSchema = z.enum(performanceMetricNames);
export type PerformanceMetricName = z.infer<typeof performanceMetricNameSchema>;

const identifierSchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(/^[A-Za-z0-9._-]+$/);

const routeSchema = z
	.string()
	.trim()
	.min(1)
	.max(512)
	.startsWith("/")
	.refine((value) => !value.includes("?") && !value.includes("#"), {
		message: "route must not contain a query or fragment",
	});

const baseEventShape = {
	// eventId 用于数据库幂等；sessionId 仅用于匿名会话聚合，不代表登录身份。
	schemaVersion: z.literal(PERFORMANCE_SCHEMA_VERSION),
	eventId: z.uuid(),
	occurredAt: z.iso.datetime({ offset: true }),
	appId: identifierSchema,
	environment: identifierSchema,
	release: identifierSchema,
	sessionId: z.uuid(),
	route: routeSchema,
};

export const webVitalEventSchema = z
	.object({
		...baseEventShape,
		type: z.literal("web-vital"),
		name: performanceMetricNameSchema,
		value: z.number().finite().nonnegative().max(600_000),
		unit: z.enum(["ms", "score"]),
	})
	.strict()
	.superRefine((event, context) => {
		// CLS 表示布局偏移程度，是没有时间单位的评分；其他 Web Vitals 使用毫秒。
		const expectedUnit = event.name === "CLS" ? "score" : "ms";
		if (event.unit !== expectedUnit) {
			context.addIssue({
				code: "custom",
				path: ["unit"],
				message: `${event.name} must use ${expectedUnit}`,
			});
		}
	});

export const pageViewEventSchema = z
	.object({
		...baseEventShape,
		type: z.literal("page-view"),
		name: z.literal("page-load"),
		value: z.number().finite().nonnegative().max(600_000),
		unit: z.literal("ms"),
	})
	.strict();

export const resourceEventSchema = z
	.object({
		...baseEventShape,
		type: z.literal("resource"),
		name: z.string().trim().min(1).max(128),
		value: z.number().finite().nonnegative().max(600_000),
		unit: z.literal("ms"),
		initiatorType: z.enum(["fetch", "xmlhttprequest"]),
	})
	.strict();

export const errorEventSchema = z
	.object({
		...baseEventShape,
		type: z.literal("error"),
		name: z.string().trim().min(1).max(128),
		message: z.string().trim().min(1).max(512),
	})
	.strict();

export const customPerformanceEventSchema = z
	.object({
		...baseEventShape,
		type: z.literal("custom"),
		name: identifierSchema,
		value: z.number().finite().nonnegative().max(600_000),
		unit: z.enum(["ms", "count", "score"]),
	})
	.strict();

export const performanceEventSchema = z.discriminatedUnion("type", [
	webVitalEventSchema,
	pageViewEventSchema,
	resourceEventSchema,
	errorEventSchema,
	customPerformanceEventSchema,
]);

export const performanceBatchSchema = z
	.object({
		schemaVersion: z.literal(PERFORMANCE_SCHEMA_VERSION),
		events: z
			.array(performanceEventSchema)
			.min(1)
			.max(PERFORMANCE_BATCH_MAX_EVENTS),
	})
	.strict();

export const cleanedPerformanceEventSchema = z.object({
	// 清洗后使用统一、可落库的 nullable 字段，避免每种事件维护独立数据表。
	...baseEventShape,
	type: z.enum(["web-vital", "page-view", "resource", "error", "custom"]),
	name: z.string().min(1).max(128),
	value: z.number().finite().nonnegative().max(600_000).nullable(),
	unit: z.enum(["ms", "count", "score"]).nullable(),
	initiatorType: z.enum(["fetch", "xmlhttprequest"]).nullable(),
	message: z.string().max(512).nullable(),
	receivedAt: z.iso.datetime({ offset: true }),
	processingLagMs: z.number().int().nonnegative(),
});

export const performanceRangeSchema = z.enum(["1h", "24h", "7d"]);

export const performanceOverviewInputSchema = z
	.object({
		// 所有筛选都在服务端参与 SQL 条件，页面不下载原始事件再自行聚合。
		range: performanceRangeSchema.default("24h"),
		environment: identifierSchema.optional(),
		release: identifierSchema.optional(),
		route: routeSchema.optional(),
	})
	.strict();

export type PerformanceEvent = z.infer<typeof performanceEventSchema>;
export type PerformanceBatch = z.infer<typeof performanceBatchSchema>;
export type CleanedPerformanceEvent = z.infer<
	typeof cleanedPerformanceEventSchema
>;
export type PerformanceOverviewInput = z.infer<
	typeof performanceOverviewInputSchema
>;
