import { z } from "zod";

export const investigationQueueEventSchema = z
	.object({
		schemaVersion: z.literal(1),
		incidentId: z.uuid(),
	})
	.strict();

export type InvestigationQueueEvent = z.infer<
	typeof investigationQueueEventSchema
>;

export const cloudWatchAlarmEventSchema = z
	.object({
		version: z.string(),
		id: z.string().min(1),
		"detail-type": z.literal("CloudWatch Alarm State Change"),
		source: z.literal("aws.cloudwatch"),
		account: z.string().regex(/^\d{12}$/),
		time: z.iso.datetime({ offset: true }),
		region: z.string().min(1).max(32),
		resources: z.array(z.string().min(1)).min(1),
		detail: z
			.object({
				alarmName: z.string().min(1).max(255),
				state: z
					.object({
						value: z.literal("ALARM"),
						reason: z.string().min(1).max(1_500),
						timestamp: z.iso.datetime({ offset: true }),
					})
					.passthrough(),
				previousState: z.unknown().optional(),
				configuration: z.unknown().optional(),
			})
			.passthrough(),
	})
	.passthrough();

export type CloudWatchAlarmEvent = z.infer<typeof cloudWatchAlarmEventSchema>;
