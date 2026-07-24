import {
	createManualIncidentInputSchema,
	getIncidentInputSchema,
	listIncidentsInputSchema,
} from "@github-account-info/ai-ops-schema";
import { TRPCError } from "@trpc/server";

import { managementProcedure, router } from "../index";
import {
	loadOpsServiceConfig,
	OpsIncidentService,
	OpsNotConfiguredError,
} from "../services/ops-incidents";

function service(): OpsIncidentService {
	try {
		return new OpsIncidentService(loadOpsServiceConfig());
	} catch (error) {
		if (error instanceof OpsNotConfiguredError) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
			});
		}
		throw error;
	}
}

export const opsRouter = router({
	list: managementProcedure
		.input(listIncidentsInputSchema)
		.query(({ input }) => service().list(input.limit, input.cursor)),
	get: managementProcedure
		.input(getIncidentInputSchema)
		.query(({ input }) => service().get(input.incidentId)),
	create: managementProcedure
		.input(createManualIncidentInputSchema)
		.mutation(({ input }) => service().create(input)),
});
