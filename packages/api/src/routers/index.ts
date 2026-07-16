import { publicProcedure, router } from "../index";
import { accountRouter } from "./account";
import { githubRouter } from "./github";
import { introductionRouter } from "./introduction";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	github: githubRouter,
	account: accountRouter,
	introduction: introductionRouter,
});
export type AppRouter = typeof appRouter;
