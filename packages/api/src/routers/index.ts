import { publicProcedure, router } from "../index";
import { accountRouter } from "./account";
import { githubRouter } from "./github";
import { introductionRouter } from "./introduction";
import { opsRouter } from "./ops";
import { performanceRouter } from "./performance";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	github: githubRouter,
	account: accountRouter,
	introduction: introductionRouter,
	ops: opsRouter,
	performance: performanceRouter,
});
export type AppRouter = typeof appRouter;
