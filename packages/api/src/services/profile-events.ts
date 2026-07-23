import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { createIntroductionReadyEvent } from "@github-account-info/events";

import type { GenerateIntroductionResponse } from "../schemas/introduction";

/**
 * 路由层只依赖这个最小接口，因此本地开发可注入 no-op，测试可注入 fake，
 * 生产环境再按配置接入 SNS。
 */
export type ProfileEventPublisher = {
	publishIntroductionReady(
		response: GenerateIntroductionResponse,
	): Promise<void>;
};

type SnsCommandSender = {
	send(command: PublishCommand): Promise<unknown>;
};

export class ProfileEventPublisherError extends Error {
	constructor() {
		// 不透传 AWS SDK 错误，避免把请求元数据或底层资源信息暴露给 API 调用方。
		super("个人介绍已生成，但业务事件暂时无法发布，请重试");
		this.name = "ProfileEventPublisherError";
	}
}

/**
 * 未配置 Topic ARN 时使用的显式 no-op。
 *
 * 这样本地环境不需要伪造 AWS 凭证；生产环境是否启用事件发布仍由启动配置决定，
 * 而不是在每次请求中动态判断环境变量。
 */
export const disabledProfileEventPublisher: ProfileEventPublisher = {
	async publishIntroductionReady() {},
};

/**
 * 创建绑定到单一 SNS Topic 的 publisher。
 *
 * client 可注入是为了在单元测试中检查最终消息，同时避免测试访问真实 AWS。
 */
export function createSnsProfileEventPublisher(options: {
	topicArn: string;
	client?: SnsCommandSender;
}): ProfileEventPublisher {
	const client = options.client ?? new SNSClient({});

	return {
		async publishIntroductionReady(response) {
			const introduction = response.introduction;
			const event = createIntroductionReadyEvent({
				githubId: introduction.githubId,
				githubUsername: introduction.githubUsername,
				generatorVersion: introduction.generatorVersion,
				generatedAt: introduction.generatedAt,
				generated: response.generated,
			});

			try {
				await client.send(
					new PublishCommand({
						TopicArn: options.topicArn,
						Message: JSON.stringify(event),
						// attribute 可供将来的 SNS filter policy 使用；消息正文仍是
						// RawMessageDelivery 下 consumer 直接解析的事件 JSON。
						MessageAttributes: {
							eventType: {
								DataType: "String",
								StringValue: event.eventType,
							},
						},
					}),
				);
			} catch {
				throw new ProfileEventPublisherError();
			}
		},
	};
}
