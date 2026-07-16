import { env } from "@github-account-info/env/server";

import { createGoIntroductionClient } from "../services/go-introduction";
import { createIntroductionRouter } from "./introduction-router";

export { createIntroductionRouter } from "./introduction-router";

const defaultGoIntroductionClient = createGoIntroductionClient({
	baseUrl: env.GO_API_INTERNAL_URL,
});

export const introductionRouter = createIntroductionRouter(
	defaultGoIntroductionClient,
);
