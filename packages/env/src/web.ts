import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_GO_API_URL: z.url().optional(),
		VITE_PREVIEW_KEY: z
			.string()
			.regex(/^preview-[0-9a-f]{12}$/)
			.optional(),
	},
	runtimeEnv: (
		import.meta as ImportMeta & {
			readonly env: Record<string, string | boolean | undefined>;
		}
	).env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
