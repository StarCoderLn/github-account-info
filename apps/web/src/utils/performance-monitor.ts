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
			})
			.catch(() => {
				// 监控失败不能影响业务页面；清空暂存数据，避免内存持续增长。
				pendingRoutes.splice(0);
			});
	};

	/**
	 * 把动态 import 放到当前渲染任务之后执行，但不能依赖 requestIdleCallback。
	 *
	 * requestIdleCallback 的 timeout 只表示“超过该时间后有机会时尽快执行”，并非
	 * 严格定时器。浏览器处于后台、主线程持续繁忙或采用更激进的节流策略时，回调
	 * 可能长时间不运行，最终表现为页面正常、SDK chunk 也存在，但首访和 SPA 跳转
	 * 始终没有上报。
	 *
	 * 0ms timer 同样不会阻塞 React 当前的首屏 render；回调中仍然是异步 dynamic
	 * import，因此只消除了不可靠的“等待空闲”门槛，没有把 SDK 合并回首屏主包。
	 */
	globalThis.setTimeout(start, 0);

	return {
		trackPageView(route) {
			if (monitor) {
				monitor.trackPageView(route);
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
