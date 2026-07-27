import { env } from "@github-account-info/env/web";
import type { PerformanceMonitor } from "@github-account-info/performance-sdk";

export type PerformanceMonitoring = {
	trackPageView(route: string): void;
};

const disabledMonitoring: PerformanceMonitoring = {
	trackPageView() {},
};

export function startPerformanceMonitoring(): PerformanceMonitoring {
	if (!env.VITE_PERFORMANCE_ENABLED) {
		return disabledMonitoring;
	}
	let monitor: PerformanceMonitor | undefined;
	const initialRoute = window.location.href;
	const pendingRoutes: string[] = [];
	const start = () => {
		void import("@github-account-info/performance-sdk")
			.then(({ createPerformanceMonitor }) => {
				monitor = createPerformanceMonitor({
					endpoint: `${env.VITE_SERVER_URL.replace(/\/$/, "")}/api/v1/performance/events`,
					appId: "github-account-info-web",
					environment: env.VITE_APP_ENVIRONMENT,
					release: env.VITE_APP_RELEASE,
					sampleRate: 1,
					trackInitialPageView: false,
				});
				monitor.start();
				monitor.trackPageView(initialRoute);
				for (const route of pendingRoutes.splice(0)) {
					monitor.trackPageView(route);
				}
			})
			.catch(() => {
				pendingRoutes.splice(0);
			});
	};

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(start, { timeout: 2_000 });
	} else {
		globalThis.setTimeout(start, 0);
	}

	return {
		trackPageView(route) {
			if (monitor) {
				monitor.trackPageView(route);
				return;
			}
			pendingRoutes.push(route);
			if (pendingRoutes.length > 100) {
				pendingRoutes.shift();
			}
		},
	};
}
