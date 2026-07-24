import {
	incidentSchema,
	investigationQueueEventSchema,
} from "@github-account-info/ai-ops-schema";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import type { Investigator } from "../agent/agent";
import {
	createMastraInvestigator,
	InvalidModelOutputError,
} from "../agent/agent";
import { loadAgentConfig } from "../config";
import { createGitHubModelsModel } from "../model/github-models";
import { createResourceCatalog } from "../resource-catalog";
import {
	DynamoIncidentRepository,
	type IncidentRepository,
} from "../storage/incident-repository";

export interface InvestigateHandlerDependencies {
	repository: IncidentRepository;
	investigator: Investigator;
	now?: () => Date;
	log?: Pick<Console, "error" | "info">;
}

async function processRecord(
	record: SQSRecord,
	dependencies: InvestigateHandlerDependencies,
): Promise<"done" | "retry"> {
	let body: unknown;
	try {
		body = JSON.parse(record.body) as unknown;
	} catch {
		dependencies.log?.error("Rejected invalid AI Ops queue event");
		return "done";
	}
	const parsedEvent = investigationQueueEventSchema.safeParse(body);
	if (!parsedEvent.success) {
		dependencies.log?.error("Rejected invalid AI Ops queue event");
		return "done";
	}

	const now = (dependencies.now ?? (() => new Date()))().toISOString();
	const incident = await dependencies.repository.get(
		parsedEvent.data.incidentId,
	);
	if (!incident) {
		dependencies.log?.error("AI Ops incident not found");
		return "done";
	}
	const validatedIncident = incidentSchema.safeParse(incident);
	if (!validatedIncident.success) {
		await dependencies.repository.fail(
			incident.incidentId,
			{
				code: "INVALID_INCIDENT",
				message: "Stored incident failed schema validation",
				failedAt: now,
				retryable: false,
			},
			now,
		);
		return "done";
	}
	if (incident.status === "completed" || incident.status === "failed")
		return "done";
	if (!(await dependencies.repository.begin(incident.incidentId, now)))
		return "done";

	try {
		const investigation = await dependencies.investigator.investigate(incident);
		await dependencies.repository.complete(
			incident.incidentId,
			investigation,
			now,
		);
		return "done";
	} catch (error) {
		if (error instanceof InvalidModelOutputError) {
			await dependencies.repository.fail(
				incident.incidentId,
				{
					code: "INVALID_MODEL_OUTPUT",
					message: "Model returned an invalid structured result",
					failedAt: now,
					retryable: false,
				},
				now,
			);
			return "done";
		}
		dependencies.log?.error(
			"AI Ops investigation failed",
			error instanceof Error ? error.name : "UnknownError",
		);
		return "retry";
	}
}

export function createInvestigateHandler(
	dependencies: InvestigateHandlerDependencies,
) {
	return async (event: SQSEvent): Promise<SQSBatchResponse> => {
		const failures: SQSBatchResponse["batchItemFailures"] = [];
		for (const record of event.Records) {
			try {
				if ((await processRecord(record, dependencies)) === "retry") {
					failures.push({ itemIdentifier: record.messageId });
				}
			} catch (error) {
				dependencies.log?.error(
					"AI Ops record processing failed",
					error instanceof Error ? error.name : "UnknownError",
				);
				failures.push({ itemIdentifier: record.messageId });
			}
		}
		return { batchItemFailures: failures };
	};
}

let productionHandler:
	| ((event: SQSEvent) => Promise<SQSBatchResponse>)
	| undefined;

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
	if (!productionHandler) {
		const config = loadAgentConfig();
		productionHandler = createInvestigateHandler({
			repository: new DynamoIncidentRepository(config.AI_OPS_INCIDENT_TABLE),
			investigator: {
				investigate: async (incident) => {
					const model = await createGitHubModelsModel(
						config.GITHUB_MODELS_SECRET_ARN,
						config.AI_MODEL,
					);
					return createMastraInvestigator(
						model,
						config.AI_MODEL,
						createResourceCatalog(config),
					).investigate(incident);
				},
			},
			log: console,
		});
	}
	return productionHandler(event);
}
