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
import {
	disabledProfileEventPublisher,
	type ProfileEventPublisher,
	ProfileEventPublisherError,
} from "../services/profile-events";

export function createIntroductionRouter(
	goIntroductionClient: GoIntroductionClient,
	profileEventPublisher: ProfileEventPublisher = disabledProfileEventPublisher,
) {
	return router({
		generate: managementProcedure
			.input(generateIntroductionInputSchema)
			.output(generateIntroductionResponseSchema)
			.mutation(async ({ input }) => {
				try {
					const response = await goIntroductionClient.generate(input);
					// 只有 Go 已生成并持久化成功后才发布 ready 事件，consumer 才能
					// 立即通过公开读接口验证同一份结果。
					await profileEventPublisher.publishIntroductionReady(response);
					return response;
				} catch (error) {
					if (error instanceof ProfileEventPublisherError) {
						// 当前采用同步发布：SNS 未确认时不向管理端宣称整条链路成功。
						// 已生成的数据仍安全保留，调用方可重试以重新触发发布。
						throw new TRPCError({
							code: "SERVICE_UNAVAILABLE",
							message: error.message,
						});
					}
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
