import { z } from "zod";

export const opsComponentSchema = z.enum([
	"node-api",
	"go-api",
	"profile-event-consumer",
	"ai-ops-agent",
]);

export type OpsComponent = z.infer<typeof opsComponentSchema>;

export const evidenceSourceSchema = z.enum([
	"cloudwatch",
	"logs",
	"ecs",
	"load-balancer",
	"lambda",
	"sqs",
	"deployment",
	"synthetics",
]);

export const evidenceSchema = z
	.object({
		evidenceId: z.string().min(1).max(128),
		source: evidenceSourceSchema,
		resource: z.string().min(1).max(512),
		observedAt: z.iso.datetime({ offset: true }),
		observation: z.string().min(1).max(1_500),
	})
	.strict();

export type InvestigationEvidence = z.infer<typeof evidenceSchema>;

export const hypothesisSchema = z
	.object({
		summary: z.string().min(1).max(750),
		confidence: z.number().min(0).max(1),
		supportingEvidenceIds: z.array(z.string().min(1).max(128)).max(12),
		contradictingEvidenceIds: z.array(z.string().min(1).max(128)).max(12),
	})
	.strict();

export const recommendationSchema = z
	.object({
		summary: z.string().min(1).max(750),
		risk: z.enum(["low", "medium", "high"]),
		// 第一版建议只进入审批队列，Agent 没有直接执行 AWS 写操作的权限。
		approvalRequired: z.literal(true),
		remediationType: z
			.enum(["disable-go-canary", "rerun-synthetics", "manual-investigation"])
			.nullable(),
	})
	.strict();

export const investigationSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.iso.datetime({ offset: true }),
		modelProvider: z.string().min(1).max(64),
		modelId: z.string().min(1).max(256),
		summary: z.string().min(1).max(1_500),
		severity: z.enum(["low", "medium", "high", "critical"]),
		rootCause: z.string().min(1).max(1_500).nullable(),
		confidence: z.number().min(0).max(1),
		hypotheses: z.array(hypothesisSchema).min(1).max(6),
		evidence: z.array(evidenceSchema).min(1).max(30),
		recommendations: z.array(recommendationSchema).max(8),
	})
	.strict()
	.superRefine((investigation, context) => {
		const evidenceIds = new Set(
			investigation.evidence.map((evidence) => evidence.evidenceId),
		);
		for (const [
			hypothesisIndex,
			hypothesis,
		] of investigation.hypotheses.entries()) {
			for (const evidenceId of [
				...hypothesis.supportingEvidenceIds,
				...hypothesis.contradictingEvidenceIds,
			]) {
				if (!evidenceIds.has(evidenceId)) {
					context.addIssue({
						code: "custom",
						path: ["hypotheses", hypothesisIndex],
						message: `unknown evidence id: ${evidenceId}`,
					});
				}
			}
		}
	});

export type Investigation = z.infer<typeof investigationSchema>;
