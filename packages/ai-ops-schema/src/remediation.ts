import { z } from "zod";

export const remediationTypeSchema = z.enum([
	"disable-go-canary",
	"rerun-synthetics",
	"manual-investigation",
]);

export const remediationStatusSchema = z.enum([
	"proposed",
	"approved",
	"rejected",
	"executing",
	"completed",
	"failed",
]);

export const remediationSchema = z
	.object({
		remediationId: z.uuid(),
		incidentId: z.uuid(),
		type: remediationTypeSchema,
		status: remediationStatusSchema,
		summary: z.string().min(1).max(750),
		risk: z.enum(["low", "medium", "high"]),
		proposedAt: z.iso.datetime({ offset: true }),
		decidedAt: z.iso.datetime({ offset: true }).nullable(),
		decidedBy: z.string().min(1).max(128).nullable(),
	})
	.strict();

export type Remediation = z.infer<typeof remediationSchema>;
