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

const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const PERFORMANCE_SCHEMA_VERSION = 1 as const;
const PERFORMANCE_SDK_BATCH_SIZE = 20;
const PERFORMANCE_SDK_QUEUE_LIMIT = 100;

export type PerformanceMonitorConfig = {
	endpoint: string;
	appId: string;
	environment: string;
	release: string;
	sampleRate?: number;
	flushIntervalMs?: number;
	batchSize?: number;
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
	trackPageView(): void;
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

	const common = () => ({
		schemaVersion: PERFORMANCE_SCHEMA_VERSION,
		eventId: createEventId(),
		occurredAt: new Date().toISOString(),
		appId: config.appId,
		environment: config.environment,
		release: config.release,
		sessionId,
		route: sanitizeRoute(browser?.window.location.href ?? "/"),
	});

	const enqueue = (event: PerformanceEvent) => {
		if (!sampled) {
			return;
		}
		queue.push(event);
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
		const pending = queue.splice(0, batchSize);
		const sent = await send({
			schemaVersion: PERFORMANCE_SCHEMA_VERSION,
			events: pending,
		});
		if (sent) {
			retriedBatch = false;
			return;
		}
		if (!retriedBatch) {
			retriedBatch = true;
			queue = [...pending, ...queue].slice(0, PERFORMANCE_SDK_QUEUE_LIMIT);
		}
	};

	const trackPageView = () => {
		if (!browser) {
			return;
		}
		const navigation = browser.performance.getEntriesByType("navigation")[0] as
			| PerformanceNavigationTiming
			| undefined;
		enqueue({
			...common(),
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
		trackPageView();
		browser.window.addEventListener("error", errorListener);
		browser.window.addEventListener("unhandledrejection", rejectionListener);
		browser.document.addEventListener("visibilitychange", visibilityListener);
		timer = setInterval(() => void flush(), flushIntervalMs);
		startResourceObserver();
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
		void flush();
	};

	const track = (event: CustomPerformanceEvent) => {
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
