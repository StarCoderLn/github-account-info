import type {
	PerformanceBatch,
	PerformanceEvent,
	PerformanceMetricName,
} from "@github-account-info/performance-schema";

import {
	sanitizeMessage,
	sanitizeResourceName,
	sanitizeRoute,
} from "./sanitize";

/**
 * 轻量浏览器 Performance SDK（RUM，真实用户监控）。
 *
 * 设计原则：
 * 1. 所有采集失败都静默降级，不能影响宿主应用。
 * 2. 队列、批量和重试都有明确上限，避免弱网下无限占用内存。
 * 3. 事件创建时立即固化并清洗 route，防止 SPA 跳转后归属到错误页面。
 * 4. schema 常量保留为字面量，避免运行时引入共享 Zod 包。
 */
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const PERFORMANCE_SCHEMA_VERSION = 1 as const;
const PERFORMANCE_SDK_BATCH_SIZE = 20;
const PERFORMANCE_SDK_QUEUE_LIMIT = 100;

export type PerformanceMonitorConfig = {
	/** Node 接收入口，不允许 SDK 直接持有任何 AWS 凭证。 */
	endpoint: string;
	/** 稳定应用标识，用于共享表中的租户边界。 */
	appId: string;
	/** deployment 环境与不可变 release 标签，用于页面筛选和版本对比。 */
	environment: string;
	release: string;
	/** 0~1 的会话级采样率；同一 monitor 实例内不会逐事件重新抽样。 */
	sampleRate?: number;
	/** 周期 flush 下限为 1 秒，防止错误配置制造请求风暴。 */
	flushIntervalMs?: number;
	/** 单次发送数量受 SDK 常量限制，不接受任意放大。 */
	batchSize?: number;
	/** SPA 集成会自行记录首访，因此可关闭 SDK 内置首访，避免重复计数。 */
	trackInitialPageView?: boolean;
};

export type CustomPerformanceEvent = {
	name: string;
	value: number;
	unit: "ms" | "count" | "score";
};

export type PerformanceMonitor = {
	start(): void;
	stop(): void;
	flush(): Promise<void>;
	track(event: CustomPerformanceEvent): void;
	trackPageView(route?: string): void;
};

type BrowserDependencies = {
	window: Window;
	document: Document;
	performance: Performance;
	fetch: typeof fetch;
};

function createEventId(): string {
	return crypto.randomUUID();
}

function validSampleRate(value: number | undefined): number {
	if (value === undefined) {
		return 1;
	}
	return Math.min(1, Math.max(0, value));
}

export function createPerformanceMonitor(
	config: PerformanceMonitorConfig,
	dependencies?: BrowserDependencies,
): PerformanceMonitor {
	const browser =
		dependencies ??
		(typeof window === "undefined"
			? null
			: { window, document, performance, fetch });
	// 会话级抽样保证同一用户会话的 page-view、错误和 Web Vitals 可以关联。
	const sampled = browser
		? Math.random() < validSampleRate(config.sampleRate)
		: false;
	const sessionId = createEventId();
	const batchSize = Math.min(
		PERFORMANCE_SDK_BATCH_SIZE,
		Math.max(1, config.batchSize ?? PERFORMANCE_SDK_BATCH_SIZE),
	);
	const flushIntervalMs = Math.max(
		1_000,
		config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
	);
	let queue: PerformanceEvent[] = [];
	let started = false;
	let retriedBatch = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let resourceObserver: PerformanceObserver | undefined;

	/**
	 * 为每条事件补齐公共维度。route 在这里而不是 flush 时计算，
	 * 否则队列中的旧事件会被后续 SPA 地址覆盖。
	 */
	const common = (route?: string) => ({
		schemaVersion: PERFORMANCE_SCHEMA_VERSION,
		eventId: createEventId(),
		occurredAt: new Date().toISOString(),
		appId: config.appId,
		environment: config.environment,
		release: config.release,
		sessionId,
		route: sanitizeRoute(route ?? browser?.window.location.href ?? "/"),
	});

	const enqueue = (event: PerformanceEvent) => {
		if (!sampled) {
			return;
		}
		queue.push(event);
		// 队列满时保留最新事件；监控数据允许有界丢弃，业务页面不可 OOM。
		if (queue.length > PERFORMANCE_SDK_QUEUE_LIMIT) {
			queue = queue.slice(-PERFORMANCE_SDK_QUEUE_LIMIT);
		}
		if (queue.length >= batchSize) {
			void flush();
		}
	};

	const reportMetric = (name: PerformanceMetricName, value: number) => {
		enqueue({
			...common(),
			type: "web-vital",
			name,
			value: Math.max(0, value),
			unit: name === "CLS" ? "score" : "ms",
		});
	};

	const send = async (batch: PerformanceBatch): Promise<boolean> => {
		if (!browser) {
			return false;
		}
		const body = JSON.stringify(batch);
		// 页面进入后台/关闭时优先 beacon；普通前台请求使用 keepalive fetch。
		if (
			browser.document.visibilityState === "hidden" &&
			typeof browser.window.navigator.sendBeacon === "function"
		) {
			return browser.window.navigator.sendBeacon(
				config.endpoint,
				new Blob([body], { type: "application/json" }),
			);
		}
		try {
			const response = await browser.fetch(config.endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
				keepalive: true,
				// RUM 入口是匿名、限 schema 的写入口，不携带 Cookie 或登录凭证。
				credentials: "omit",
			});
			return response.ok;
		} catch {
			return false;
		}
	};

	const flush = async () => {
		if (queue.length === 0) {
			return;
		}
		// 先从主队列取出，避免发送期间新到事件与本批相互覆盖。
		const pending = queue.splice(0, batchSize);
		const sent = await send({
			schemaVersion: PERFORMANCE_SCHEMA_VERSION,
			events: pending,
		});
		if (sent) {
			retriedBatch = false;
			return;
		}
		// 失败批次最多回队一次；持续失败时不无限重试或阻塞后续页面交互。
		if (!retriedBatch) {
			retriedBatch = true;
			queue = [...pending, ...queue].slice(0, PERFORMANCE_SDK_QUEUE_LIMIT);
		}
	};

	const trackPageView = (route?: string) => {
		if (!browser) {
			return;
		}
		// SPA 跳转没有新的 NavigationTiming；此时沿用本次文档导航耗时作为
		// page-view 的体验参考，访问次数的准确性由显式 route 保证。
		const navigation = browser.performance.getEntriesByType("navigation")[0] as
			| PerformanceNavigationTiming
			| undefined;
		enqueue({
			...common(route),
			type: "page-view",
			name: "page-load",
			value: Math.max(0, navigation?.duration ?? 0),
			unit: "ms",
		});
	};

	const errorListener = (event: ErrorEvent) => {
		enqueue({
			...common(),
			type: "error",
			name: event.error?.name?.slice(0, 128) || "Error",
			message: sanitizeMessage(event.message || "Unknown browser error"),
		});
	};

	const rejectionListener = (event: PromiseRejectionEvent) => {
		const reason =
			event.reason instanceof Error
				? `${event.reason.name}: ${event.reason.message}`
				: String(event.reason);
		enqueue({
			...common(),
			type: "error",
			name:
				event.reason instanceof Error
					? event.reason.name
					: "UnhandledRejection",
			message: sanitizeMessage(reason),
		});
	};

	const visibilityListener = () => {
		// 页面隐藏时尽快排空，降低定时器被浏览器节流造成的数据损失。
		if (browser?.document.visibilityState === "hidden") {
			void flush();
		}
	};

	const startResourceObserver = () => {
		if (!browser || typeof PerformanceObserver === "undefined") {
			return;
		}
		resourceObserver = new PerformanceObserver((list) => {
			for (const rawEntry of list.getEntries()) {
				const entry = rawEntry as PerformanceResourceTiming;
				if (
					(entry.initiatorType !== "fetch" &&
						entry.initiatorType !== "xmlhttprequest") ||
					// 排除 SDK 自己的上传请求，否则会形成“监控监控请求”的递归噪声。
					entry.name.startsWith(config.endpoint)
				) {
					continue;
				}
				enqueue({
					...common(),
					type: "resource",
					name: sanitizeResourceName(entry.name),
					value: Math.max(0, entry.duration),
					unit: "ms",
					initiatorType: entry.initiatorType,
				});
			}
		});
		resourceObserver.observe({ type: "resource", buffered: true });
	};

	const start = () => {
		if (!browser || !sampled || started) {
			return;
		}
		started = true;
		if (config.trackInitialPageView !== false) {
			trackPageView();
		}
		browser.window.addEventListener("error", errorListener);
		browser.window.addEventListener("unhandledrejection", rejectionListener);
		browser.document.addEventListener("visibilitychange", visibilityListener);
		timer = setInterval(() => void flush(), flushIntervalMs);
		startResourceObserver();
		// web-vitals 是相对较重的依赖，按需动态加载以缩小应用首屏主 chunk。
		void import("web-vitals")
			.then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
				onCLS((metric) => reportMetric("CLS", metric.value));
				onFCP((metric) => reportMetric("FCP", metric.value));
				onINP((metric) => reportMetric("INP", metric.value));
				onLCP((metric) => reportMetric("LCP", metric.value));
				onTTFB((metric) => reportMetric("TTFB", metric.value));
			})
			.catch(() => undefined);
	};

	const stop = () => {
		if (!browser || !started) {
			return;
		}
		started = false;
		if (timer) {
			clearInterval(timer);
			timer = undefined;
		}
		resourceObserver?.disconnect();
		resourceObserver = undefined;
		browser.window.removeEventListener("error", errorListener);
		browser.window.removeEventListener("unhandledrejection", rejectionListener);
		browser.document.removeEventListener(
			"visibilitychange",
			visibilityListener,
		);
		// stop 不阻塞卸载流程；最后一批仍通过 keepalive/beacon 尽力发送。
		void flush();
	};

	const track = (event: CustomPerformanceEvent) => {
		// 自定义事件仍受统一的名称长度和非负数约束。
		enqueue({
			...common(),
			type: "custom",
			name: event.name.slice(0, 80),
			value: Math.max(0, event.value),
			unit: event.unit,
		});
	};

	return { start, stop, flush, track, trackPageView };
}
