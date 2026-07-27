import { z } from "zod";

const configSchema = z.object({
	AWS_REGION: z.string().min(1).default("us-east-2"),
	PERFORMANCE_PROCESSOR_MODE: z
		.enum(["processor", "migrate"])
		.default("processor"),
	PERFORMANCE_QUEUE_URL: z
		.url()
		.refine((value) => value.startsWith("https://sqs.")),
	DATABASE_URL: z.string().min(1),
	RDS_CA_BUNDLE: z.string().min(1).default("/app/certs/rds-bundle.pem"),
	POLL_WAIT_SECONDS: z.coerce.number().int().min(1).max(20).default(20),
	VISIBILITY_TIMEOUT_SECONDS: z.coerce
		.number()
		.int()
		.min(30)
		.max(900)
		.default(120),
});

export type ProcessorConfig = z.infer<typeof configSchema>;

export function loadConfig(
	source: Record<string, string | undefined> = process.env,
): ProcessorConfig {
	return configSchema.parse(source);
}
