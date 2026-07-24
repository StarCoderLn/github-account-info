import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export interface SecretReader {
	readSecret(secretArn: string): Promise<string>;
}

export class AwsSecretReader implements SecretReader {
	constructor(private readonly client = new SecretsManagerClient({})) {}

	async readSecret(secretArn: string): Promise<string> {
		const result = await this.client.send(
			new GetSecretValueCommand({ SecretId: secretArn }),
		);
		const token = result.SecretString?.trim();
		if (!token) throw new Error("GitHub Models secret is empty");
		return token;
	}
}

export async function createGitHubModelsModel(
	secretArn: string,
	modelId: string,
	secretReader: SecretReader = new AwsSecretReader(),
) {
	const token = await secretReader.readSecret(secretArn);
	const githubModels = createOpenAICompatible({
		name: "github-models",
		baseURL: "https://models.github.ai/inference",
		apiKey: token,
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2026-03-10",
			"User-Agent": "github-account-info-ai-ops-agent",
		},
	});
	return githubModels(modelId);
}
