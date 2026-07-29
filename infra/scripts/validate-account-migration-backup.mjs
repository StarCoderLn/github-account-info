import { readFileSync } from "node:fs";

const read = (path) =>
	readFileSync(new URL(path, import.meta.url), { encoding: "utf8" });

const packageJson = JSON.parse(read("../../package.json"));
const gitignore = read("../../.gitignore");
const migrationGuide = read("../AWS_ACCOUNT_MIGRATION.md");
const createBackup = read("./create-account-migration-backup.mjs");
const restoreBackup = read("./restore-account-migration-backup.mjs");
const restorePostgres = read("./restore-postgres-dump.mjs");
const restoreDynamoDb = read("./restore-dynamodb-scan.mjs");

for (const scriptName of [
	"migration:backup-aws-data",
	"migration:restore-backup",
	"migration:restore-postgres",
	"migration:restore-dynamodb",
]) {
	if (!packageJson.scripts?.[scriptName]) {
		throw new Error(`package.json is missing ${scriptName}`);
	}
}

if (!gitignore.split("\n").includes(".local-backups/")) {
	throw new Error(
		"encrypted and plaintext migration backups must be ignored by Git",
	);
}

for (const requiredText of [
	"SOURCE_AWS_ACCOUNT_ID",
	"macOS Keychain",
	"ARCHIVE_SHA256",
	"TARGET_AWS_ACCOUNT_ID",
]) {
	if (!migrationGuide.includes(requiredText)) {
		throw new Error(
			`migration guide is missing backup contract: ${requiredText}`,
		);
	}
}

for (const [name, source, requiredText] of [
	["create backup", createBackup, "security"],
	["restore backup", restoreBackup, "archiveSha256"],
	["restore PostgreSQL", restorePostgres, "TARGET_AWS_ACCOUNT_ID"],
	["restore DynamoDB", restoreDynamoDb, "UnprocessedItems"],
]) {
	if (!source.includes(requiredText)) {
		throw new Error(
			`${name} script is missing safety behavior: ${requiredText}`,
		);
	}
}

console.log(
	"AWS migration backup validated: encrypted local archive, checksums, account guards, and data restore helpers",
);
