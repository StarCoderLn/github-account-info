/**
 * GitHub API 客户端服务
 *
 * 职责:
 * - 封装对 GitHub REST API GET /user 的请求
 * - 注入必要请求头（Authorization / User-Agent / Accept）
 * - 设置 10s 超时
 * - 按 HTTP 状态语义抛出自定义错误（由路由层捕获并映射为 TRPCError）
 * - 成功时返回归一化的 GithubAccount 结构
 *
 * 安全: token 仅存在于请求头，禁止写日志、禁止返回给调用方。
 */

import { z } from "zod";

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

// ---------- 自定义错误类型 ----------

export class GithubAuthError extends Error {
	constructor(message = "GitHub token 无效或已过期") {
		super(message);
		this.name = "GithubAuthError";
	}
}

export class GithubRateLimitError extends Error {
	constructor(message = "GitHub API 请求频率超限，请稍后重试") {
		super(message);
		this.name = "GithubRateLimitError";
	}
}

export class GithubPermissionError extends Error {
	constructor(message = "GitHub token 权限不足") {
		super(message);
		this.name = "GithubPermissionError";
	}
}

export class GithubApiError extends Error {
	constructor(
		public readonly status: number,
		message = `GitHub API 返回错误状态码 ${status}`,
	) {
		super(message);
		this.name = "GithubApiError";
	}
}

// ---------- 归一化输出类型 ----------

/**
 * zod schema — 用于 tRPC procedure `.output()` 校验与类型推导。
 * 字段与 feature 2 的 github_account 表保持一致，便于 feature 3 直接落库。
 */
export const githubAccountSchema = z.object({
	login: z.string(),
	githubId: z.number().int(),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	bio: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	email: z.string().nullable(),
	blog: z.string().nullable(),
	twitterUsername: z.string().nullable(),
	publicRepos: z.number().int().nonnegative(),
	followers: z.number().int().nonnegative(),
	following: z.number().int().nonnegative(),
});

/** TypeScript 类型从 zod schema 推导，保证两者始终同步。 */
export type GithubAccount = z.infer<typeof githubAccountSchema>;

// ---------- GitHub 响应原始结构（仅声明需要的字段）----------

interface GithubUserResponse {
	login: string;
	id: number;
	name: string | null;
	avatar_url: string | null;
	bio: string | null;
	company: string | null;
	location: string | null;
	email: string | null;
	blog: string | null;
	twitter_username: string | null;
	public_repos: number;
	followers: number;
	following: number;
}

// ---------- 归一化映射 ----------

function normalizeGithubUser(raw: GithubUserResponse): GithubAccount {
	return {
		login: raw.login,
		githubId: raw.id,
		name: raw.name ?? null,
		avatarUrl: raw.avatar_url ?? null,
		bio: raw.bio ?? null,
		company: raw.company ?? null,
		location: raw.location ?? null,
		email: raw.email ?? null,
		blog: raw.blog || null,
		twitterUsername: raw.twitter_username ?? null,
		publicRepos: raw.public_repos,
		followers: raw.followers,
		following: raw.following,
	};
}

// ---------- 主函数 ----------

/**
 * 使用 Personal Access Token 拉取 GitHub 账户信息。
 *
 * @param token GitHub PAT（由路由层传入，禁止在此函数内记录日志）
 * @throws {GithubAuthError} token 无效或已过期（HTTP 401）
 * @throws {GithubRateLimitError} API 限流（HTTP 403 + x-ratelimit-remaining: 0）
 * @throws {GithubPermissionError} token 权限不足（HTTP 403 非限流）
 * @throws {GithubApiError} 其它非 2xx 状态码
 * @throws {Error} 网络/超时错误（AbortError 等）
 */
export async function fetchGithubAccount(
	token: string,
): Promise<GithubAccount> {
	let res: Response;

	try {
		res = await fetch(`${GITHUB_API_BASE}/user`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "github-account-info",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		// 超时或网络错误
		if (err instanceof DOMException && err.name === "TimeoutError") {
			throw new Error("请求 GitHub API 超时，请稍后重试");
		}
		throw err;
	}

	if (res.ok) {
		const data = (await res.json()) as GithubUserResponse;
		return normalizeGithubUser(data);
	}

	// 错误路径：按状态码映射语义错误
	switch (res.status) {
		case 401:
			throw new GithubAuthError();

		case 403: {
			const remaining = res.headers.get("x-ratelimit-remaining");
			if (remaining === "0") {
				throw new GithubRateLimitError();
			}
			throw new GithubPermissionError();
		}

		default:
			throw new GithubApiError(res.status);
	}
}
