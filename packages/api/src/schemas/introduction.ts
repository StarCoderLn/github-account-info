import { z } from "zod";

const githubUsernamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const publicHttpUrlSchema = z.url().refine((value) => {
	const protocol = new URL(value).protocol;
	return protocol === "https:" || protocol === "http:";
}, "URL 必须使用 http 或 https 协议");

export const githubUsernameSchema = z
	.string()
	.trim()
	.min(1, "GitHub username 不能为空")
	.max(39, "GitHub username 最多 39 个字符")
	.regex(githubUsernamePattern, "GitHub username 格式不正确")
	.refine(
		(value) => !value.includes("--"),
		"GitHub username 不能包含连续连字符",
	);

export const publicIntroductionSchema = z.object({
	githubId: z.number().int().nonnegative(),
	githubUsername: githubUsernameSchema,
	name: z.string().nullable(),
	avatarUrl: publicHttpUrlSchema.nullable(),
	bio: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	blog: z.string().nullable(),
	twitterUsername: z.string().nullable(),
	publicRepos: z.number().int().nonnegative(),
	followers: z.number().int().nonnegative(),
	following: z.number().int().nonnegative(),
	introduction: z.string().min(1),
	generatorVersion: z.string().min(1),
	generatedAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});

export const generateIntroductionInputSchema = z.object({
	githubUsername: githubUsernameSchema,
	regenerate: z.boolean().default(false),
});

export const generateIntroductionResponseSchema = z.object({
	introduction: publicIntroductionSchema,
	generated: z.boolean(),
});

export const introductionApiErrorSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
});

export type PublicIntroduction = z.infer<typeof publicIntroductionSchema>;
export type GenerateIntroductionInput = z.infer<
	typeof generateIntroductionInputSchema
>;
export type GenerateIntroductionResponse = z.infer<
	typeof generateIntroductionResponseSchema
>;
