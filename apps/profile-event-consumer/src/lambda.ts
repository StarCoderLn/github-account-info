import { publicIntroductionSchema } from "@github-account-info/api/schemas/introduction";
import { profileEventSchema } from "@github-account-info/events";

type SqsRecord = {
	messageId: string;
	body: string;
};

type SqsEvent = {
	Records: SqsRecord[];
};

type Fetcher = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const PUBLICATION_REQUEST_TIMEOUT_MS = 8_000;

class PublicationVerificationError extends Error {
	constructor(code: string) {
		// name 使用稳定错误码写入结构化日志，message 刻意不包含响应正文或 URL 参数。
		super("Public profile publication verification failed");
		this.name = code;
	}
}

/**
 * 构造 SQS handler。fetcher 可注入，以便测试 404、5xx 和内容不一致等重试场景。
 *
 * Lambda event source 开启了 ReportBatchItemFailures，因此返回值中的 messageId
 * 决定“只重试本条消息”；若在这里直接抛出，整批已成功的消息也会再次投递。
 */
export function createHandler(options: {
	publicApiUrl: string;
	fetcher?: Fetcher;
}) {
	const publicApiUrl = new URL(options.publicApiUrl);
	const fetcher = options.fetcher ?? fetch;

	return async function handleProfileEvents(event: SqsEvent) {
		const results = await Promise.all(
			event.Records.map(async (record) => {
				try {
					// RawMessageDelivery=true 时 body 就是事件 JSON，无需再拆 SNS envelope。
					const payload: unknown = JSON.parse(record.body);
					const profileEvent = profileEventSchema.parse(payload);
					const requestUrl = new URL(
						`/api/v1/github-users/${encodeURIComponent(profileEvent.githubUsername)}/introduction`,
						publicApiUrl,
					);
					const response = await fetcher(requestUrl, {
						method: "GET",
						headers: {
							Accept: "application/json",
							"User-Agent": "github-account-info-publication-verifier/1.0",
						},
						// 超时也作为该 record 的失败处理，让 SQS 按 visibility timeout
						// 重试；连续五次失败后由队列 RedrivePolicy 移入 DLQ。
						signal: AbortSignal.timeout(PUBLICATION_REQUEST_TIMEOUT_MS),
					});

					if (!response.ok) {
						throw new PublicationVerificationError(
							`PublicIntroductionHttp${response.status}`,
						);
					}

					const introduction = publicIntroductionSchema.parse(
						await response.json(),
					);
					// HTTP 200 只证明路由可用；继续比对生成结果，防止缓存、路由错误或
					// 延迟写入导致事件指向的版本尚未真正对公网可见。
					if (
						introduction.githubId !== profileEvent.githubId ||
						introduction.githubUsername.toLowerCase() !==
							profileEvent.githubUsername.toLowerCase() ||
						introduction.generatorVersion !== profileEvent.generatorVersion ||
						introduction.generatedAt !== profileEvent.generatedAt
					) {
						throw new PublicationVerificationError(
							"PublicIntroductionMismatch",
						);
					}

					console.log(
						JSON.stringify({
							level: "info",
							message: "profile publication verified",
							eventId: profileEvent.eventId,
							eventType: profileEvent.eventType,
							githubId: profileEvent.githubId,
							githubUsername: profileEvent.githubUsername,
						}),
					);
					return null;
				} catch (error) {
					console.error(
						JSON.stringify({
							level: "error",
							message: "profile publication verification failed",
							messageId: record.messageId,
							errorName: error instanceof Error ? error.name : "UnknownError",
						}),
					);
					// 只返回 AWS 要求的 itemIdentifier，不把错误或原消息带回响应。
					return { itemIdentifier: record.messageId };
				}
			}),
		);

		// null 表示该 record 已确认成功；失败项会被 Lambda/SQS 单独重试。
		return { batchItemFailures: results.filter((result) => result !== null) };
	};
}

export async function handler(event: SqsEvent) {
	// 部署配置错误应让整次 invocation 明确失败，而不是把所有消息伪装成业务坏消息。
	const publicApiUrl = process.env.PUBLIC_API_URL;
	if (!publicApiUrl) {
		throw new Error("PUBLIC_API_URL is required");
	}
	return createHandler({ publicApiUrl })(event);
}
