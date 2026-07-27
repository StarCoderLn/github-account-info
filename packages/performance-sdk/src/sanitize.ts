/**
 * SDK 侧的最小化清洗。
 *
 * 这里不依赖 Zod，目的是保持浏览器 chunk 轻量；ECS processor 会在可信边界内
 * 再执行一次独立校验和清洗。两层防线分别解决“尽量不上传敏感数据”和“最终落库
 * 数据必须可信”的问题。
 */
const CREDENTIAL_PATTERNS = [
	/(?:token|authorization|password|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
	/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
] as const;

export function sanitizeRoute(value: string): string {
	try {
		// 使用固定虚拟 origin 兼容相对路径，同时只保留 pathname。
		const parsed = new URL(value, "https://performance.invalid");
		const pathname = parsed.pathname || "/";
		if (pathname.startsWith("/u/")) {
			return "/u/:username";
		}
		return pathname
			.split("/")
			.map((segment) => {
				// 数字 ID、UUID 和长十六进制 ID 统一折叠，避免高基数与路径泄露。
				if (/^\d+$/.test(segment)) {
					return ":id";
				}
				if (
					/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
					/^[0-9a-f]{16,}$/i.test(segment)
				) {
					return ":id";
				}
				return segment;
			})
			.join("/")
			.slice(0, 512);
	} catch {
		return "/";
	}
}

export function sanitizeMessage(value: string): string {
	let sanitized = value;
	// 先脱敏再截断，避免凭证恰好位于截断边界而只泄露一部分。
	for (const pattern of CREDENTIAL_PATTERNS) {
		sanitized = sanitized.replace(pattern, "[REDACTED]");
	}
	return sanitized
		.replace(/[\r\n\t]+/g, " ")
		.trim()
		.slice(0, 512);
}

export function sanitizeResourceName(value: string): string {
	// 资源事件只需要归一化 pathname，不保留域名、query 或 fragment。
	const route = sanitizeRoute(value);
	return route.slice(0, 128) || "/";
}
