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
	// 生产 ECS 直连 RDS：加载受版本控制的 CA 并严格校验证书，禁止关闭 TLS 校验。
	ssl: {
		ca: readFileSync(config.RDS_CA_BUNDLE, "utf8"),
		rejectUnauthorized: true,
	},
	max: 4,
});

if (config.PERFORMANCE_PROCESSOR_MODE === "migrate") {
	// 同一不可变镜像兼作一次性迁移 Task，避免 GitHub-hosted runner 直连私有 RDS。
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
	// processor 模式长期轮询 SQS；业务查询 API 不承担清洗职责。
	const repository = createPerformanceEventRepository(pool);
	const sqs = new SQSClient({ region: config.AWS_REGION });
	const controller = new AbortController();

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		// ECS 停止 Task 时先结束轮询，再关闭连接池，避免粗暴中断当前数据库操作。
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
