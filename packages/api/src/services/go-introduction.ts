import {
	type GenerateIntroductionInput,
	type GenerateIntroductionResponse,
	generateIntroductionResponseSchema,
	introductionApiErrorSchema,
} from "../schemas/introduction";

const DEFAULT_TIMEOUT_MS = 8_000;

export type GoIntroductionErrorKind =
	| "invalid_request"
	| "not_found"
	| "unavailable"
	| "invalid_response";

export class GoIntroductionClientError extends Error {
	constructor(
		public readonly kind: GoIntroductionErrorKind,
		message: string,
		public readonly status?: number,
		public readonly apiCode?: string,
	) {
		super(message);
		this.name = "GoIntroductionClientError";
	}
}

type FetchImplementation = typeof fetch;

export type GoIntroductionClient = {
	generate(
		input: GenerateIntroductionInput,
	): Promise<GenerateIntroductionResponse>;
};

export function createGoIntroductionClient(options: {
	baseUrl: string;
	timeoutMs?: number;
	fetchImplementation?: FetchImplementation;
}): GoIntroductionClient {
	const baseUrl = new URL(options.baseUrl);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImplementation = options.fetchImplementation ?? fetch;

	return {
		async generate(input) {
			let response: Response;

			try {
				response = await fetchImplementation(
					new URL("/internal/v1/introductions", baseUrl),
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(input),
						signal: AbortSignal.timeout(timeoutMs),
					},
				);
			} catch (error) {
				if (
					error instanceof DOMException &&
					(error.name === "TimeoutError" || error.name === "AbortError")
				) {
					throw new GoIntroductionClientError(
						"unavailable",
						"个人介绍服务响应超时，请稍后重试",
					);
				}
				throw new GoIntroductionClientError(
					"unavailable",
					"个人介绍服务暂时无法连接，请稍后重试",
				);
			}

			const payload = await readJson(response);
			if (!response.ok) {
				const apiError = introductionApiErrorSchema.safeParse(payload);
				const apiCode = apiError.success ? apiError.data.error.code : undefined;
				const apiMessage = apiError.success
					? apiError.data.error.message
					: undefined;

				if (response.status === 400) {
					throw new GoIntroductionClientError(
						"invalid_request",
						apiMessage ?? "GitHub username 格式不正确",
						response.status,
						apiCode,
					);
				}
				if (response.status === 404) {
					throw new GoIntroductionClientError(
						"not_found",
						apiMessage ?? "数据库中没有找到该 GitHub 账号",
						response.status,
						apiCode,
					);
				}
				if (response.status === 503) {
					throw new GoIntroductionClientError(
						"unavailable",
						"个人介绍服务暂时不可用，请稍后重试",
						response.status,
						apiCode,
					);
				}
				throw new GoIntroductionClientError(
					"invalid_response",
					"个人介绍服务返回了异常响应",
					response.status,
					apiCode,
				);
			}

			const parsed = generateIntroductionResponseSchema.safeParse(payload);
			if (!parsed.success) {
				throw new GoIntroductionClientError(
					"invalid_response",
					"个人介绍服务返回的数据格式不正确",
					response.status,
				);
			}
			return parsed.data;
		},
	};
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new GoIntroductionClientError(
			"invalid_response",
			"个人介绍服务返回了无法解析的响应",
			response.status,
		);
	}
}
