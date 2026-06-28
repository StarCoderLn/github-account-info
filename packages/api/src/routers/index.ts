import { publicProcedure, router } from "../index";
import { accountRouter } from "./account";
import { githubRouter } from "./github";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	github: githubRouter,
	account: accountRouter,
});
export type AppRouter = typeof appRouter;
