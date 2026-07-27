import {
	type CleanedPerformanceEvent,
	cleanedPerformanceEventSchema,
	type PerformanceEvent,
} from "@github-account-info/performance-schema";

const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const CREDENTIAL_PATTERNS = [
	/(?:token|authorization|password|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
	/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
] as const;

export class PermanentPerformanceEventError extends Error {
	override name = "PermanentPerformanceEventError";
}

export function normalizeRoute(value: string): string {
	const parsed = new URL(value, "https://performance.invalid");
	if (parsed.pathname.startsWith("/u/")) {
		return "/u/:username";
	}
	return parsed.pathname
		.split("/")
		.map((segment) => {
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
	if (skewMs > MAX_FUTURE_MS || skewMs < -MAX_PAST_MS) {
		throw new PermanentPerformanceEventError(
			"performance event timestamp is outside the accepted window",
		);
	}

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
	return cleanedPerformanceEventSchema.parse(cleaned);
}
