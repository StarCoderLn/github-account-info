const REDACTION_RULES: RegExp[] = [
	/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
	/\bAKIA[A-Z0-9]{16}\b/g,
	/\b(?:postgres(?:ql)?):\/\/[^\s"'<>]+/gi,
	/\b(?:token|password|secret|api[_-]?key)\s*[=:]\s*[^\s,;"']+/gi,
];

export function redactText(value: string): string {
	return REDACTION_RULES.reduce(
		(redacted, rule) => redacted.replace(rule, "[REDACTED]"),
		value,
	);
}

export function truncateAndRedact(value: string, maxLength = 1_500): string {
	return redactText(value).slice(0, maxLength);
}
