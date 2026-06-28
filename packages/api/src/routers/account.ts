import {
	githubAccount,
	githubAccountInsertSchema,
	githubAccountUpdateSchema,
} from "@github-account-info/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

function isUniqueConstraintError(err: unknown): boolean {
	return (
		err instanceof Error &&
		(err.message.includes("unique constraint") ||
			err.message.includes("duplicate key") ||
			("code" in err && (err as { code: string }).code === "23505"))
	);
}

export const accountRouter = router({
	// T-003: list — 按 updatedAt 倒序
	list: publicProcedure.query(async ({ ctx }) => {
		return ctx.db
			.select()
			.from(githubAccount)
			.orderBy(desc(githubAccount.updatedAt));
	}),

	// T-004: create — zod 校验 + 唯一冲突 → CONFLICT
	create: publicProcedure
		.input(githubAccountInsertSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				const [row] = await ctx.db
					.insert(githubAccount)
					.values(input)
					.returning();
				return row;
			} catch (err) {
				if (isUniqueConstraintError(err)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `githubId ${input.githubId} 已存在，不能重复添加`,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: err instanceof Error ? err.message : "新增失败",
				});
			}
		}),

	// T-005: update — 按 id 更新，刷新 updatedAt，未命中 → NOT_FOUND
	update: publicProcedure
		.input(githubAccountUpdateSchema)
		.mutation(async ({ input, ctx }) => {
			const { id, ...data } = input;
			try {
				const [row] = await ctx.db
					.update(githubAccount)
					.set({ ...data, updatedAt: new Date() })
					.where(eq(githubAccount.id, id))
					.returning();
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `id=${id} 的记录不存在`,
					});
				}
				return row;
			} catch (err) {
				if (err instanceof TRPCError) throw err;
				if (isUniqueConstraintError(err)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `githubId ${data.githubId} 已存在，不能重复`,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: err instanceof Error ? err.message : "更新失败",
				});
			}
		}),

	// T-006: delete — 按 id 删除
	delete: publicProcedure
		.input(z.object({ id: z.number().int() }))
		.mutation(async ({ input, ctx }) => {
			await ctx.db.delete(githubAccount).where(eq(githubAccount.id, input.id));
			return { id: input.id };
		}),
});
