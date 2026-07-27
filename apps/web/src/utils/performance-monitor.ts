import { env } from "@github-account-info/env/web";

export function startPerformanceMonitoring(): void {
	if (!env.VITE_PERFORMANCE_ENABLED) {
		return;
	}
	const start = () => {
		void import("@github-account-info/performance-sdk").then(
			({ createPerformanceMonitor }) => {
				const monitor = createPerformanceMonitor({
					endpoint: `${env.VITE_SERVER_URL.replace(/\/$/, "")}/api/v1/performance/events`,
					appId: "github-account-info-web",
					environment: env.VITE_APP_ENVIRONMENT,
					release: env.VITE_APP_RELEASE,
					sampleRate: 1,
				});
				monitor.start();
			},
		);
	};

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(start, { timeout: 2_000 });
		return;
	}
	globalThis.setTimeout(start, 0);
}
