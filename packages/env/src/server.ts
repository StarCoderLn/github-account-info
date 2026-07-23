import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		CORS_ORIGIN: z.url(),
		GO_API_INTERNAL_URL: z.url().default("http://localhost:8080"),
		PROFILE_EVENTS_TOPIC_ARN: z
			.string()
			// 只接受完整 SNS ARN；Topic 名称或 Queue URL 若误填会在启动时失败，
			// 而不是等到用户生成介绍后才暴露配置错误。
			.regex(
				/^arn:(aws|aws-us-gov|aws-cn):sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/,
			)
			.optional(),
		MANAGEMENT_API_ENABLED: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.default(false),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
