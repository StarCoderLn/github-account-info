import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const environment = (name) => process.env[name]?.trim();
const region = environment("AWS_REGION") || "us-east-2";
const expectedAccountId = environment("TARGET_AWS_ACCOUNT_ID");
const scanArgument = process.argv[2];
const targetTableName = process.argv[3];

if (!expectedAccountId || !/^[0-9]{12}$/.test(expectedAccountId)) {
	throw new Error(
		"TARGET_AWS_ACCOUNT_ID must be the 12-digit target account ID",
	);
}
if (!scanArgument || !targetTableName) {
	throw new Error(
		"usage: pnpm migration:restore-dynamodb -- <items.json> <target-table-name>",
	);
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== expectedAccountId) {
	throw new Error(
		`AWS identity account ${identity.Account} does not match TARGET_AWS_ACCOUNT_ID`,
	);
}

const targetTable = awsJson([
	"dynamodb",
	"describe-table",
	"--region",
	region,
	"--table-name",
	targetTableName,
]);
if (targetTable.Table?.TableStatus !== "ACTIVE") {
	throw new Error(`target DynamoDB table ${targetTableName} is not ACTIVE`);
}

const scan = JSON.parse(readFileSync(resolve(scanArgument), "utf8"));
if (!Array.isArray(scan.Items)) {
	throw new Error("DynamoDB scan backup does not contain an Items array");
}

let restoredCount = 0;
for (let index = 0; index < scan.Items.length; index += 25) {
	let pending = scan.Items.slice(index, index + 25).map((item) => ({
		PutRequest: { Item: item },
	}));
	for (let attempt = 1; pending.length > 0 && attempt <= 10; attempt += 1) {
		const response = awsJson([
			"dynamodb",
			"batch-write-item",
			"--region",
			region,
			"--request-items",
			JSON.stringify({ [targetTableName]: pending }),
		]);
		pending = response.UnprocessedItems?.[targetTableName] ?? [];
		if (pending.length > 0) {
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, Math.min(2 ** attempt * 100, 5_000)),
			);
		}
	}
	if (pending.length > 0) {
		throw new Error(
			`DynamoDB still has ${pending.length} unprocessed items after retries`,
		);
	}
	restoredCount += Math.min(25, scan.Items.length - index);
}

console.log(
	`Restored ${restoredCount} DynamoDB items to ${targetTableName} in account ${expectedAccountId}`,
);

function awsJson(args) {
	return JSON.parse(
		execFileSync("aws", [...args, "--output", "json", "--no-cli-pager"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "inherit"],
			maxBuffer: 100 * 1024 * 1024,
		}),
	);
}
