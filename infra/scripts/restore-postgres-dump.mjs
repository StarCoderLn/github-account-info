import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const environment = (name) => process.env[name]?.trim();
const region = environment("AWS_REGION") || "us-east-2";
const expectedAccountId = environment("TARGET_AWS_ACCOUNT_ID");
const localPort = environment("LOCAL_DATABASE_PORT") || "5433";
const dumpArgument = process.argv[2];
const secretArgument = process.argv[3];

if (!expectedAccountId || !/^[0-9]{12}$/.test(expectedAccountId)) {
	throw new Error(
		"TARGET_AWS_ACCOUNT_ID must be the 12-digit target account ID",
	);
}
if (!dumpArgument || !secretArgument) {
	throw new Error(
		"usage: pnpm migration:restore-postgres -- <dump-file> <target-secret-name-or-arn>",
	);
}
if (!/^[1-9][0-9]{0,4}$/.test(localPort) || Number(localPort) > 65535) {
	throw new Error("LOCAL_DATABASE_PORT must be between 1 and 65535");
}

const dumpPath = resolve(dumpArgument);
if (!existsSync(dumpPath)) {
	throw new Error(`PostgreSQL dump does not exist: ${dumpPath}`);
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== expectedAccountId) {
	throw new Error(
		`AWS identity account ${identity.Account} does not match TARGET_AWS_ACCOUNT_ID`,
	);
}

const secret = awsJson([
	"secretsmanager",
	"get-secret-value",
	"--region",
	region,
	"--secret-id",
	secretArgument,
]);
const databaseUrl = extractDatabaseUrl(secret.SecretString, secretArgument);
const parsedUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (!databaseName) {
	throw new Error("target database URL has no database name");
}

const pgRestore = resolvePostgresTool("pg_restore");
const result = spawnSync(
	pgRestore,
	[
		"--host",
		"127.0.0.1",
		"--port",
		localPort,
		"--username",
		decodeURIComponent(parsedUrl.username),
		"--dbname",
		databaseName,
		"--no-owner",
		"--no-privileges",
		"--exit-on-error",
		"--single-transaction",
		dumpPath,
	],
	{
		env: {
			...process.env,
			PGPASSWORD: decodeURIComponent(parsedUrl.password),
			PGSSLMODE: "require",
		},
		stdio: "inherit",
	},
);
if (result.error) {
	throw result.error;
}
if (result.status !== 0) {
	throw new Error(`pg_restore failed with exit code ${result.status}`);
}
console.log(
	`Restored ${basename(dumpPath)} to target account ${expectedAccountId}`,
);

function extractDatabaseUrl(rawValue, secretName) {
	if (typeof rawValue !== "string" || rawValue.length === 0) {
		throw new Error(`secret ${secretName} has no SecretString`);
	}
	if (
		rawValue.startsWith("postgres://") ||
		rawValue.startsWith("postgresql://")
	) {
		return rawValue;
	}
	let parsed;
	try {
		parsed = JSON.parse(rawValue);
	} catch {
		throw new Error(`secret ${secretName} is not a PostgreSQL URL or JSON`);
	}
	for (const key of [
		"DATABASE_URL",
		"databaseUrl",
		"url",
		"connectionString",
	]) {
		if (
			typeof parsed?.[key] === "string" &&
			(parsed[key].startsWith("postgres://") ||
				parsed[key].startsWith("postgresql://"))
		) {
			return parsed[key];
		}
	}
	throw new Error(`secret ${secretName} contains no recognized PostgreSQL URL`);
}

function resolvePostgresTool(name) {
	for (const candidate of [
		environment(`${name.toUpperCase()}_BIN`),
		`/usr/local/opt/libpq/bin/${name}`,
		`/opt/homebrew/opt/libpq/bin/${name}`,
		name,
	].filter(Boolean)) {
		const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
		if (result.status === 0) {
			return candidate;
		}
	}
	throw new Error(`${name} was not found; install Homebrew libpq first`);
}

function awsJson(args) {
	return JSON.parse(
		execFileSync("aws", [...args, "--output", "json", "--no-cli-pager"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "inherit"],
		}),
	);
}
