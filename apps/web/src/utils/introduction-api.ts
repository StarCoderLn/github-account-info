import {
	githubUsernameSchema,
	introductionApiErrorSchema,
	type PublicIntroduction,
	publicIntroductionSchema,
} from "@github-account-info/api/schemas/introduction";
import { env } from "@github-account-info/env/web";
import { queryOptions } from "@tanstack/react-query";

import { previewEnvironment, withPreviewHeader } from "./preview-request";

const PUBLIC_REQUEST_TIMEOUT_MS = 8_000;
const publicApiBaseUrl = env.VITE_GO_API_URL ?? env.VITE_SERVER_URL;

export class PublicIntroductionApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code: string,
	) {
		super(message);
		this.name = "PublicIntroductionApiError";
	}
}

export const introductionQueryKey = (githubUsername: string) =>
	[
		"public-introduction",
		previewEnvironment ?? "production",
		githubUsername.toLowerCase(),
	] as const;

export function publicIntroductionQueryOptions(
	githubUsername: string,
	options: { enabled?: boolean } = {},
) {
	return queryOptions({
		queryKey: introductionQueryKey(githubUsername),
		queryFn: ({ signal }) =>
			fetchPublicIntroduction(githubUsername, { signal }),
		enabled: options.enabled ?? true,
		staleTime: 60_000,
		retry: (failureCount, error) => {
			if (failureCount >= 2) return false;
			if (!(error instanceof PublicIntroductionApiError)) return true;
			return error.status === 0 || error.status >= 500;
		},
		meta: { suppressGlobalErrorToast: true },
	});
}

export async function fetchPublicIntroduction(
	githubUsername: string,
	options: { signal?: AbortSignal } = {},
): Promise<PublicIntroduction> {
	const username = githubUsernameSchema.safeParse(githubUsername);
	if (!username.success) {
		throw new PublicIntroductionApiError(
			"GitHub username 格式不正确",
			400,
			"invalid_username",
		);
	}

	const signals = [AbortSignal.timeout(PUBLIC_REQUEST_TIMEOUT_MS)];
	if (options.signal) signals.push(options.signal);

	let response: Response;
	try {
		response = await fetch(
			new URL(
				`/api/v1/github-users/${encodeURIComponent(username.data)}/introduction`,
				publicApiBaseUrl,
			),
			{
				method: "GET",
				headers: withPreviewHeader({ Accept: "application/json" }),
				signal: AbortSignal.any(signals),
			},
		);
	} catch (error) {
		if (options.signal?.aborted) throw error;
		if (
			error instanceof DOMException &&
			(error.name === "TimeoutError" || error.name === "AbortError")
		) {
			throw new PublicIntroductionApiError(
				"个人介绍服务响应超时",
				504,
				"request_timeout",
			);
		}
		throw new PublicIntroductionApiError(
			"无法连接个人介绍服务",
			0,
			"network_error",
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new PublicIntroductionApiError(
			"个人介绍服务返回了无法解析的响应",
			502,
			"invalid_response",
		);
	}

	if (!response.ok) {
		const apiError = introductionApiErrorSchema.safeParse(payload);
		throw new PublicIntroductionApiError(
			apiError.success ? apiError.data.error.message : "读取个人介绍失败",
			response.status,
			apiError.success ? apiError.data.error.code : "request_failed",
		);
	}

	const parsed = publicIntroductionSchema.safeParse(payload);
	if (!parsed.success) {
		throw new PublicIntroductionApiError(
			"个人介绍服务返回的数据格式不正确",
			502,
			"invalid_response",
		);
	}
	return parsed.data;
}
