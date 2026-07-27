import { createContext } from "@github-account-info/api/context";
import { appRouter } from "@github-account-info/api/routers/index";
import { env } from "@github-account-info/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createPerformanceRoutes } from "./routes/performance";

export const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({
				context,
				managementApiEnabled: env.MANAGEMENT_API_ENABLED,
			});
		},
	}),
);

app.route("/api/v1/performance", createPerformanceRoutes());

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
