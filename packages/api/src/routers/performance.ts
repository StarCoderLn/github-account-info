import { performanceOverviewInputSchema } from "@github-account-info/performance-schema";

import { managementProcedure, router } from "../index";
import { getPerformanceOverview } from "../services/performance-stats";

export const performanceRouter = router({
	// 可视化查询属于管理能力，复用项目现有 managementProcedure 身份边界。
	overview: managementProcedure
		.input(performanceOverviewInputSchema)
		.query(({ ctx, input }) => getPerformanceOverview(ctx.db, input)),
});
