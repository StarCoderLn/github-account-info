import { env } from "@github-account-info/env/web";
import type { PerformanceMonitor } from "@github-account-info/performance-sdk";

/**
 * Web 应用与通用性能 SDK 之间的薄适配层。
 *
 * 这里负责读取 Vite 环境变量、延迟加载 SDK，并衔接 SPA 路由事件；
 * SDK 本身不依赖当前应用的路由器和环境配置，因此仍可被其他前端复用。
 */
export type PerformanceMonitoring = {
	trackPageView(route: string): void;
};

// 关闭采集时返回相同接口，调用方无需在每次路由切换时重复判断开关。
const disabledMonitoring: PerformanceMonitoring = {
	trackPageView() {},
};

export function startPerformanceMonitoring(): PerformanceMonitoring {
	if (!env.VITE_PERFORMANCE_ENABLED) {
		return disabledMonitoring;
	}
	let monitor: PerformanceMonitor | undefined;
	// SDK 是空闲时异步加载的，先固定启动瞬间的地址，避免加载期间首访地址被覆盖。
	const initialRoute = window.location.href;
	const pendingRoutes: string[] = [];
	const start = () => {
		// 动态 import 把监控依赖拆成独立 chunk，避免阻塞应用首屏渲染。
		void import("@github-account-info/performance-sdk")
			.then(({ createPerformanceMonitor }) => {
				monitor = createPerformanceMonitor({
					endpoint: `${env.VITE_SERVER_URL.replace(/\/$/, "")}/api/v1/performance/events`,
					appId: "github-account-info-web",
					environment: env.VITE_APP_ENVIRONMENT,
					release: env.VITE_APP_RELEASE,
					sampleRate: 1,
					// 首访由适配层显式补报，防止 SDK start() 与 Router 首次 resolve 重复计数。
					trackInitialPageView: false,
				});
				monitor.start();
				monitor.trackPageView(initialRoute);
				// 重放 SDK 就绪前发生的真实 SPA 跳转，保持访问统计连续。
				for (const route of pendingRoutes.splice(0)) {
					monitor.trackPageView(route);
				}
				/**
				 * 页面访问量属于准实时页面的核心计数，首访和 SDK 就绪前暂存的路由
				 * 不能继续等待 5 秒周期 timer。后台标签页会节流 interval，可能让
				 * 页面已经打开很久但访问量仍不变化。
				 *
				 * flush 仍由 SDK 统一执行批量上限、一次失败回填和静默降级；这里只
				 * 提前发送已经排队的 page-view，不会让 Web Vitals 变成逐条请求。
				 */
				void monitor.flush();
			})
			.catch(() => {
				// 监控失败不能影响业务页面；清空暂存数据，避免内存持续增长。
				pendingRoutes.splice(0);
			});
	};

	/**
	 * 直接发起 dynamic import，不再在外层增加 idle callback 或 timer。
	 *
	 * import() 本身异步返回 Promise，SDK 也仍是独立 chunk，因此不会把监控依赖
	 * 合并进首屏主包；额外调度反而会给浏览器留下延迟甚至节流启动的机会。调用后
	 * 立即返回轻量代理，加载期间发生的 SPA 跳转继续由 pendingRoutes 有界暂存。
	 */
	start();

	return {
		trackPageView(route) {
			if (monitor) {
				monitor.trackPageView(route);
				// SPA 路由访问需要尽快进入统计，不依赖可能被节流的周期 timer。
				void monitor.flush();
				return;
			}
			pendingRoutes.push(route);
			// SDK 长时间无法加载时只保留最近 100 次跳转，给内存占用设置硬上限。
			if (pendingRoutes.length > 100) {
				pendingRoutes.shift();
			}
		},
	};
}
