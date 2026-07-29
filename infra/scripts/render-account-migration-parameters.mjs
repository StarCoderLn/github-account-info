import { execFileSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
const parameterDirectory = resolve(repositoryRoot, "infra", "parameters");

const targetAccountId = requiredEnv("TARGET_AWS_ACCOUNT_ID");
const region = process.env.AWS_REGION?.trim() || "us-east-2";
const accountStackName =
	process.env.ACCOUNT_STACK_NAME?.trim() ||
	"github-account-info-aws-account-foundation";
const networkStackName =
	process.env.NETWORK_STACK_NAME?.trim() ||
	"github-account-info-aws-network-database";
const productionSecretArn = requiredEnv("PRODUCTION_DATABASE_SECRET_ARN");
const previewSecretArn = requiredEnv("PREVIEW_DATABASE_SECRET_ARN");

if (!/^[0-9]{12}$/.test(targetAccountId)) {
	throw new Error("TARGET_AWS_ACCOUNT_ID must contain exactly 12 digits");
}

for (const [name, value] of [
	["PRODUCTION_DATABASE_SECRET_ARN", productionSecretArn],
	["PREVIEW_DATABASE_SECRET_ARN", previewSecretArn],
]) {
	const expected = `:${region}:${targetAccountId}:secret:`;
	if (!value.startsWith("arn:") || !value.includes(expected)) {
		throw new Error(`${name} must belong to the target account and region`);
	}
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== targetAccountId) {
	throw new Error(
		`AWS identity account ${identity.Account} does not match TARGET_AWS_ACCOUNT_ID`,
	);
}

const accountOutputs = stackOutputs(accountStackName);
const networkOutputs = stackOutputs(networkStackName);

const deploymentRoleArn = requiredOutput(
	accountOutputs,
	"DeploymentRoleArn",
	accountStackName,
);
const vpcId = requiredOutput(networkOutputs, "VpcId", networkStackName);
const privateSubnetIds = requiredOutput(
	networkOutputs,
	"PrivateSubnetIds",
	networkStackName,
);
const lambdaSecurityGroupId = requiredOutput(
	networkOutputs,
	"LambdaSecurityGroupId",
	networkStackName,
);
const rdsSecurityGroupId = requiredOutput(
	networkOutputs,
	"RdsSecurityGroupId",
	networkStackName,
);

writeJson("go-foundation.local.json", [
	{ ParameterKey: "VpcId", ParameterValue: vpcId },
	{ ParameterKey: "PrivateSubnetIds", ParameterValue: privateSubnetIds },
	{
		ParameterKey: "LambdaSecurityGroupId",
		ParameterValue: lambdaSecurityGroupId,
	},
	{
		ParameterKey: "RdsSecurityGroupId",
		ParameterValue: rdsSecurityGroupId,
	},
]);

writeJson("go-iam.local.json", [
	{
		ParameterKey: "DatabaseUrlSecretArn",
		ParameterValue: productionSecretArn,
	},
	{
		ParameterKey: "PreviewDatabaseUrlSecretArn",
		ParameterValue: previewSecretArn,
	},
]);

writeJson("migration-target.local.json", {
	accountId: targetAccountId,
	region,
	accountStackName,
	networkStackName,
	githubVariables: {
		AWS_DEPLOY_ROLE_ARN: deploymentRoleArn,
		AWS_LAMBDA_SUBNET_IDS: privateSubnetIds,
		AWS_LAMBDA_SECURITY_GROUP_IDS: lambdaSecurityGroupId,
	},
});

console.log(
	[
		"Generated target-account parameter files:",
		"- infra/parameters/go-foundation.local.json",
		"- infra/parameters/go-iam.local.json",
		"- infra/parameters/migration-target.local.json",
		"No secret values were read or written.",
	].join("\n"),
);

function stackOutputs(stackName) {
	const response = awsJson([
		"cloudformation",
		"describe-stacks",
		"--region",
		region,
		"--stack-name",
		stackName,
	]);
	const stacks = response.Stacks ?? [];
	if (stacks.length !== 1) {
		throw new Error(`expected exactly one stack named ${stackName}`);
	}
	return Object.fromEntries(
		(stacks[0].Outputs ?? []).map((output) => [
			output.OutputKey,
			output.OutputValue,
		]),
	);
}

function requiredOutput(outputs, key, stackName) {
	const value = outputs[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`stack ${stackName} is missing required output ${key}`);
	}
	return value;
}

function requiredEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

function awsJson(args) {
	const stdout = execFileSync("aws", [...args, "--output", "json", "--no-cli-pager"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
	return JSON.parse(stdout);
}

function writeJson(fileName, value) {
	const filePath = resolve(parameterDirectory, fileName);
	writeFileSync(
		filePath,
		`${JSON.stringify(value, null, 2)}\n`,
		{ mode: 0o600 },
	);
	chmodSync(filePath, 0o600);
}
