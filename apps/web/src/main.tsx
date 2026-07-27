import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { startPerformanceMonitoring } from "./utils/performance-monitor";
import { queryClient, trpc } from "./utils/trpc";

const router = createRouter({
	routeTree,
	// 意图预加载减少页面跳转等待；pending 只替换路由内容，不触发浏览器整页刷新。
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultPendingComponent: () => <Loader />,
	context: { trpc, queryClient },
	Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
	// React 首屏挂载后再启动监控，确保采集逻辑不位于关键渲染路径上。
	const performanceMonitoring = startPerformanceMonitoring();
	router.subscribe("onResolved", (event) => {
		// 首次 resolve 没有 fromLocation，首访已由适配层记录；这里只统计真实 SPA path 变化。
		if (event.fromLocation && event.pathChanged) {
			performanceMonitoring.trackPageView(event.toLocation.href);
		}
	});
}
