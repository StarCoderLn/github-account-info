import { env } from "@github-account-info/env/server";

import { createGoIntroductionClient } from "../services/go-introduction";
import {
	createSnsProfileEventPublisher,
	disabledProfileEventPublisher,
} from "../services/profile-events";
import { createIntroductionRouter } from "./introduction-router";

export { createIntroductionRouter } from "./introduction-router";

const defaultGoIntroductionClient = createGoIntroductionClient({
	baseUrl: env.GO_API_INTERNAL_URL,
});
// Topic ARN 是功能开关：本地不配置即可只运行核心业务；AWS 环境配置后才创建
// SNS client。避免模块加载时无条件依赖 AWS 凭证，也避免请求内反复读取 env。
const defaultProfileEventPublisher = env.PROFILE_EVENTS_TOPIC_ARN
	? createSnsProfileEventPublisher({ topicArn: env.PROFILE_EVENTS_TOPIC_ARN })
	: disabledProfileEventPublisher;

export const introductionRouter = createIntroductionRouter(
	defaultGoIntroductionClient,
	defaultProfileEventPublisher,
);
