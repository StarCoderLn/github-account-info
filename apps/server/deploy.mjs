import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) continue;
	const idx = trimmed.indexOf("=");
	if (idx === -1) continue;
	env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const databaseUrl = env["DATABASE_URL"];
const corsOrigin = env["CORS_ORIGIN"] ?? "*";

if (!databaseUrl) {
	console.error("DATABASE_URL not found in .env");
	process.exit(1);
}

const cmd = [
	"sam deploy",
	"--no-confirm-changeset",
	`--parameter-overrides DatabaseUrl='${databaseUrl}' CorsOrigin='${corsOrigin}'`,
].join(" ");

console.log("Deploying to AWS Lambda...");
execSync(cmd, { stdio: "inherit" });
