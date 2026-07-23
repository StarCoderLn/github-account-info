import { z } from "zod";

/**
 * `introduction.ready` 的跨服务事件契约。
 *
 * 事件只携带验证公开介绍所需的不可逆业务标识，不携带 PAT、介绍正文或
 * DATABASE_URL。publisher 与 SQS consumer 共用此 schema，避免两端各自维护
 * 一份字段定义后发生静默漂移。
 */
export const profileEventSchema = z.object({
	eventId: z.string().min(1).max(256),
	eventType: z.literal("introduction.ready"),
	// 新增或破坏性修改字段时必须提升版本，并让 consumer 显式兼容新版本。
	schemaVersion: z.literal(1),
	githubId: z.number().int().nonnegative(),
	githubUsername: z
		.string()
		.min(1)
		.max(39)
		.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i),
	generatorVersion: z.string().min(1).max(64),
	generatedAt: z.iso.datetime({ offset: true }),
	generated: z.boolean(),
});

export type ProfileEvent = z.infer<typeof profileEventSchema>;

/**
 * 将已持久化的介绍结果转换为可发布事件。
 *
 * eventId 由结果本身确定，同一生成结果因 SNS 超时等原因重发时仍得到相同 ID，
 * 便于日志关联和未来增加幂等存储；它不是秘密，也不作为鉴权凭证使用。
 */
export function createIntroductionReadyEvent(input: {
	githubId: number;
	githubUsername: string;
	generatorVersion: string;
	generatedAt: string;
	generated: boolean;
}): ProfileEvent {
	return profileEventSchema.parse({
		eventId: [
			"introduction.ready",
			input.githubId,
			input.generatorVersion,
			input.generatedAt,
		].join(":"),
		eventType: "introduction.ready",
		schemaVersion: 1,
		...input,
	});
}
