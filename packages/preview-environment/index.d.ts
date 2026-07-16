export type PreviewEnvironment = Readonly<Record<string, string | undefined>>;

export declare function previewKeyFromCommitSha(commitSha: unknown): string;
export declare function cloudflarePreviewKey(
	environment: PreviewEnvironment,
): string;
export declare function isPreviewKey(value: unknown): boolean;
