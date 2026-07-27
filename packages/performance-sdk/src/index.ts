/**
 * SDK 的公开入口。只暴露稳定 API 与必要类型，内部队列和浏览器依赖保持私有，
 * 方便后续替换传输实现而不影响业务应用。
 */
export {
	type CustomPerformanceEvent,
	createPerformanceMonitor,
	type PerformanceMonitor,
	type PerformanceMonitorConfig,
} from "./monitor";
export {
	sanitizeMessage,
	sanitizeResourceName,
	sanitizeRoute,
} from "./sanitize";
