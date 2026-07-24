import type { OpsComponent } from "@github-account-info/ai-ops-schema";

import type { AgentConfig } from "./config";

export interface ComponentResources {
	logGroup: string;
	kind: "http-service" | "event-consumer" | "lambda";
	alarmNames: string[];
	stackName: string;
}

export interface ResourceCatalog {
	components: Record<OpsComponent, ComponentResources>;
	queues: {
		profileEvents: string;
		profileEventsDlq: string;
	};
}

export function createResourceCatalog(config: AgentConfig): ResourceCatalog {
	return {
		components: {
			"node-api": {
				logGroup: config.NODE_API_LOG_GROUP,
				kind: "http-service",
				alarmNames: ["github-account-info-go-http-api-5xx"],
				stackName: "github-account-info",
			},
			"go-api": {
				logGroup: config.GO_API_LOG_GROUP,
				kind: "http-service",
				alarmNames: ["github-account-info-go-production-target-5xx"],
				stackName: "github-account-info-go-production",
			},
			"profile-event-consumer": {
				logGroup: config.PROFILE_CONSUMER_LOG_GROUP,
				kind: "event-consumer",
				alarmNames: [
					"github-account-info-profile-events-dlq-not-empty",
					"github-account-info-profile-events-oldest-message",
				],
				stackName: "github-account-info-profile-events",
			},
			"ai-ops-agent": {
				logGroup: `/aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME ?? "ai-ops-agent"}`,
				kind: "lambda",
				alarmNames: ["github-account-info-ai-ops-dlq-not-empty"],
				stackName: "github-account-info-ai-ops",
			},
		},
		queues: {
			profileEvents: config.PROFILE_EVENTS_QUEUE_URL,
			profileEventsDlq: config.PROFILE_EVENTS_DLQ_URL,
		},
	};
}
