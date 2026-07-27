import {
	type CleanedPerformanceEvent,
	cleanedPerformanceEventSchema,
	type PerformanceEvent,
} from "@github-account-info/performance-schema";

const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
// SDK 已做第一层脱敏；processor 再做一次服务端防御，不能信任浏览器实现。
const CREDENTIAL_PATTERNS = [
	/(?:token|authorization|password|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
	/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
] as const;

export class PermanentPerformanceEventError extends Error {
	override name = "PermanentPerformanceEventError";
}

export function normalizeRoute(value: string): string {
	// 虚拟 origin 只用于解析相对路径，最终不会被保存。
	const parsed = new URL(value, "https://performance.invalid");
	if (parsed.pathname.startsWith("/u/")) {
		return "/u/:username";
	}
	return parsed.pathname
		.split("/")
		.map((segment) => {
			// 将常见数字、UUID、长哈希折叠为 :id，控制路由统计的基数。
			if (
				/^\d+$/.test(segment) ||
				/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
				/^[0-9a-f]{16,}$/i.test(segment)
			) {
				return ":id";
			}
			return segment;
		})
		.join("/")
		.slice(0, 512);
}

export function redactText(value: string): string {
	let result = value;
	for (const pattern of CREDENTIAL_PATTERNS) {
		result = result.replace(pattern, "[REDACTED]");
	}
	return result
		.replace(/[\r\n\t]+/g, " ")
		.trim()
		.slice(0, 512);
}

export function cleanPerformanceEvent(
	event: PerformanceEvent,
	now = new Date(),
): CleanedPerformanceEvent {
	const occurredAt = new Date(event.occurredAt);
	const skewMs = occurredAt.getTime() - now.getTime();
	// 超过保留窗口或明显来自未来的事件永久拒绝，不让毒消息反复进入 DLQ。
	if (skewMs > MAX_FUTURE_MS || skewMs < -MAX_PAST_MS) {
		throw new PermanentPerformanceEventError(
			"performance event timestamp is outside the accepted window",
		);
	}

	// 把判别联合统一成数据库友好的 nullable 结构，非当前事件类型的字段写 null。
	const cleaned = {
		...event,
		route: normalizeRoute(event.route),
		name: redactText(event.name).slice(0, 128),
		value: "value" in event ? event.value : null,
		unit: "unit" in event ? event.unit : null,
		initiatorType: event.type === "resource" ? event.initiatorType : null,
		message: event.type === "error" ? redactText(event.message) : null,
		receivedAt: now.toISOString(),
		processingLagMs: Math.max(0, now.getTime() - occurredAt.getTime()),
	};
	// 清洗完成后再次验证服务端契约，确保写库边界不会接收形态不完整的数据。
	return cleanedPerformanceEventSchema.parse(cleaned);
}
