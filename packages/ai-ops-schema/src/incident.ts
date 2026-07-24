import { z } from "zod";

import { investigationSchema, opsComponentSchema } from "./investigation";

export const incidentStatusSchema = z.enum([
	"queued",
	"investigating",
	"completed",
	"failed",
]);

export const incidentSourceSchema = z.enum(["manual", "cloudwatch-alarm"]);

export const incidentFailureSchema = z
	.object({
		code: z.enum([
			"INVALID_EVENT",
			"INCIDENT_NOT_FOUND",
			"INVALID_INCIDENT",
			"INVALID_MODEL_OUTPUT",
			"INVESTIGATION_FAILED",
		]),
		message: z.string().min(1).max(500),
		failedAt: z.iso.datetime({ offset: true }),
		retryable: z.boolean(),
	})
	.strict();

export const alarmContextSchema = z
	.object({
		alarmName: z.string().min(1).max(255),
		alarmArn: z.string().min(1).max(1_024),
		region: z.string().min(1).max(32),
		occurredAt: z.iso.datetime({ offset: true }),
		reason: z.string().min(1).max(1_500),
	})
	.strict();

export const manualContextSchema = z
	.object({
		component: opsComponentSchema,
		reason: z.string().min(3).max(750),
	})
	.strict();

export const incidentSchema = z
	.object({
		schemaVersion: z.literal(1),
		incidentId: z.uuid(),
		projectKey: z.literal("PROJECT#github-account-info"),
		createdKey: z.string().min(1).max(128),
		dedupeKey: z.string().min(1).max(512),
		source: incidentSourceSchema,
		status: incidentStatusSchema,
		title: z.string().min(1).max(255),
		createdAt: z.iso.datetime({ offset: true }),
		updatedAt: z.iso.datetime({ offset: true }),
		expiresAt: z.number().int().positive(),
		alarmContext: alarmContextSchema.nullable(),
		manualContext: manualContextSchema.nullable(),
		investigation: investigationSchema.nullable(),
		failure: incidentFailureSchema.nullable(),
	})
	.strict()
	.superRefine((incident, context) => {
		if (incident.source === "manual" && incident.manualContext === null) {
			context.addIssue({
				code: "custom",
				path: ["manualContext"],
				message: "manual incident requires manualContext",
			});
		}
		if (
			incident.source === "cloudwatch-alarm" &&
			incident.alarmContext === null
		) {
			context.addIssue({
				code: "custom",
				path: ["alarmContext"],
				message: "alarm incident requires alarmContext",
			});
		}
		if (incident.status === "completed" && incident.investigation === null) {
			context.addIssue({
				code: "custom",
				path: ["investigation"],
				message: "completed incident requires investigation",
			});
		}
		if (incident.status === "failed" && incident.failure === null) {
			context.addIssue({
				code: "custom",
				path: ["failure"],
				message: "failed incident requires failure",
			});
		}
	});

export type OpsIncident = z.infer<typeof incidentSchema>;

export const createManualIncidentInputSchema = manualContextSchema;
export type CreateManualIncidentInput = z.infer<
	typeof createManualIncidentInputSchema
>;

export const getIncidentInputSchema = z
	.object({ incidentId: z.uuid() })
	.strict();

export const listIncidentsInputSchema = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
		cursor: z.string().min(1).max(2_048).optional(),
	})
	.strict()
	.default({ limit: 20 });
