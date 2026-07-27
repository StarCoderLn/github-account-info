const CREDENTIAL_PATTERNS = [
	/(?:token|authorization|password|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
	/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
] as const;

export function sanitizeRoute(value: string): string {
	try {
		const parsed = new URL(value, "https://performance.invalid");
		const pathname = parsed.pathname || "/";
		if (pathname.startsWith("/u/")) {
			return "/u/:username";
		}
		return pathname
			.split("/")
			.map((segment) => {
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
	for (const pattern of CREDENTIAL_PATTERNS) {
		sanitized = sanitized.replace(pattern, "[REDACTED]");
	}
	return sanitized
		.replace(/[\r\n\t]+/g, " ")
		.trim()
		.slice(0, 512);
}

export function sanitizeResourceName(value: string): string {
	const route = sanitizeRoute(value);
	return route.slice(0, 128) || "/";
}
