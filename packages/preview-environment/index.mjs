const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const PREVIEW_KEY_PATTERN = /^preview-[0-9a-f]{12}$/;

export function previewKeyFromCommitSha(commitSha) {
	const normalized = String(commitSha ?? "")
		.trim()
		.toLowerCase();
	if (!FULL_COMMIT_SHA_PATTERN.test(normalized)) {
		throw new Error(
			"preview commit SHA must contain exactly 40 hexadecimal characters",
		);
	}
	return `preview-${normalized.slice(0, 12)}`;
}

export function cloudflarePreviewKey(environment) {
	const explicitKey = String(environment.VITE_PREVIEW_KEY ?? "").trim();
	if (explicitKey !== "") {
		if (!PREVIEW_KEY_PATTERN.test(explicitKey)) {
			throw new Error(
				"VITE_PREVIEW_KEY must use preview-<12 lowercase hex> format",
			);
		}
		return explicitKey;
	}

	if (environment.CF_PAGES !== "1") return "";

	const branch = String(environment.CF_PAGES_BRANCH ?? "").trim();
	const productionBranch = String(
		environment.CF_PAGES_PRODUCTION_BRANCH ?? "master",
	).trim();
	if (branch === "") {
		throw new Error("CF_PAGES_BRANCH is required in a Cloudflare Pages build");
	}
	if (branch === productionBranch) return "";

	return previewKeyFromCommitSha(environment.CF_PAGES_COMMIT_SHA);
}

export function isPreviewKey(value) {
	return PREVIEW_KEY_PATTERN.test(String(value ?? ""));
}
