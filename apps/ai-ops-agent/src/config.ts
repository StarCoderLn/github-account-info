import { z } from "zod";

export const agentConfigSchema = z
	.object({
		AWS_REGION: z.string().min(1),
		AI_OPS_INCIDENT_TABLE: z.string().min(1),
		GITHUB_MODELS_SECRET_ARN: z.string().min(1),
		AI_MODEL: z.string().min(1),
		NODE_API_LOG_GROUP: z.string().min(1),
		GO_API_LOG_GROUP: z.string().min(1),
		PROFILE_CONSUMER_LOG_GROUP: z.string().min(1),
		PROFILE_EVENTS_QUEUE_URL: z.url(),
		PROFILE_EVENTS_DLQ_URL: z.url(),
	})
	.passthrough();

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function loadAgentConfig(
	environment: NodeJS.ProcessEnv = process.env,
): AgentConfig {
	return agentConfigSchema.parse(environment);
}
