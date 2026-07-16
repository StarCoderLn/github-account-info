import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const managementProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.managementApiEnabled) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "生产环境未开放管理操作",
		});
	}

	return next({ ctx });
});
