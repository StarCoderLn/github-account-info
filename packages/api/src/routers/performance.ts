import { performanceOverviewInputSchema } from "@github-account-info/performance-schema";

import { managementProcedure, router } from "../index";
import { getPerformanceOverview } from "../services/performance-stats";

export const performanceRouter = router({
	overview: managementProcedure
		.input(performanceOverviewInputSchema)
		.query(({ ctx, input }) => getPerformanceOverview(ctx.db, input)),
});
