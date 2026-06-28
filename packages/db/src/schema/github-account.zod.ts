import { z } from "zod";

/**
 * Insert schema — 新增 github_account 时的入参白名单与校验规则。
 * 与 GithubAccountInsert 字段对齐；id/createdAt/updatedAt 由数据库自动填充，不需要传入。
 */
export const githubAccountInsertSchema = z.object({
	login: z.string().min(1, "login 不能为空"),
	githubId: z.number().int("githubId 必须为整数"),
	name: z.string().nullable().optional(),
	avatarUrl: z.string().nullable().optional(),
	bio: z.string().nullable().optional(),
	company: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	email: z.string().email("email 格式不正确").nullable().optional(),
	blog: z.string().nullable().optional(),
	twitterUsername: z.string().nullable().optional(),
	publicRepos: z.number().int().min(0).optional(),
	followers: z.number().int().min(0).optional(),
	following: z.number().int().min(0).optional(),
});

export type GithubAccountInsertInput = z.infer<
	typeof githubAccountInsertSchema
>;

/**
 * Update schema — 按 id 更新时的入参白名单；除 id 外所有字段均为可选。
 */
export const githubAccountUpdateSchema = githubAccountInsertSchema
	.partial()
	.extend({
		id: z.number().int("id 必须为整数"),
	});

export type GithubAccountUpdateInput = z.infer<
	typeof githubAccountUpdateSchema
>;
