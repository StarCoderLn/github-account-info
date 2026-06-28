import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import {
	fetchGithubAccount,
	GithubAuthError,
	GithubPermissionError,
	GithubRateLimitError,
	githubAccountSchema,
} from "../services/github";

export const githubRouter = router({
	getAccount: publicProcedure
		.input(z.object({ token: z.string().trim().min(1, "token 不能为空") }))
		.output(githubAccountSchema)
		.mutation(async ({ input }) => {
			try {
				return await fetchGithubAccount(input.token);
			} catch (err) {
				if (err instanceof GithubAuthError) {
					throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
				}
				if (err instanceof GithubRateLimitError) {
					throw new TRPCError({
						code: "TOO_MANY_REQUESTS",
						message: err.message,
					});
				}
				if (err instanceof GithubPermissionError) {
					throw new TRPCError({ code: "FORBIDDEN", message: err.message });
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: err instanceof Error ? err.message : "请求 GitHub API 失败",
				});
			}
		}),
});
