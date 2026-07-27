import { readFileSync } from "node:fs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { loadConfig } from "./config";
import { runProcessor } from "./processor";
import { createPerformanceEventRepository } from "./repository";

const config = loadConfig();
const pool = new Pool({
	connectionString: config.DATABASE_URL,
	ssl: {
		ca: readFileSync(config.RDS_CA_BUNDLE, "utf8"),
		rejectUnauthorized: true,
	},
	max: 4,
});

if (config.PERFORMANCE_PROCESSOR_MODE === "migrate") {
	try {
		await migrate(drizzle(pool), {
			migrationsFolder: new URL("./migrations", import.meta.url).pathname,
		});
		console.log(
			JSON.stringify({
				level: "info",
				message: "performance database migrations completed",
			}),
		);
	} finally {
		await pool.end();
	}
} else {
	const repository = createPerformanceEventRepository(pool);
	const sqs = new SQSClient({ region: config.AWS_REGION });
	const controller = new AbortController();

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => controller.abort());
	}

	console.log(
		JSON.stringify({
			level: "info",
			message: "performance processor started",
		}),
	);

	try {
		await runProcessor({ sqs, repository, config }, controller.signal);
	} finally {
		await pool.end();
		console.log(
			JSON.stringify({
				level: "info",
				message: "performance processor stopped",
			}),
		);
	}
}
