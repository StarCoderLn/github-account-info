import { TRPCError } from "@trpc/server";

import { managementProcedure, router } from "../index";
import {
	generateIntroductionInputSchema,
	generateIntroductionResponseSchema,
} from "../schemas/introduction";
import {
	type GoIntroductionClient,
	GoIntroductionClientError,
} from "../services/go-introduction";

export function createIntroductionRouter(
	goIntroductionClient: GoIntroductionClient,
) {
	return router({
		generate: managementProcedure
			.input(generateIntroductionInputSchema)
			.output(generateIntroductionResponseSchema)
			.mutation(async ({ input }) => {
				try {
					return await goIntroductionClient.generate(input);
				} catch (error) {
					if (error instanceof GoIntroductionClientError) {
						switch (error.kind) {
							case "invalid_request":
								throw new TRPCError({
									code: "BAD_REQUEST",
									message: error.message,
								});
							case "not_found":
								throw new TRPCError({
									code: "NOT_FOUND",
									message: error.message,
								});
							case "unavailable":
								throw new TRPCError({
									code: "SERVICE_UNAVAILABLE",
									message: error.message,
								});
							case "invalid_response":
								throw new TRPCError({
									code: "BAD_GATEWAY",
									message: error.message,
								});
						}
					}

					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "生成个人介绍失败",
					});
				}
			}),
	});
}
