import { env } from "@github-account-info/env/web";

export const previewEnvironment = env.VITE_PREVIEW_KEY ?? null;

export function withPreviewHeader(
	headers: Readonly<Record<string, string>>,
): Record<string, string> {
	if (previewEnvironment === null) return { ...headers };
	return {
		...headers,
		"X-Preview-Environment": previewEnvironment,
	};
}
