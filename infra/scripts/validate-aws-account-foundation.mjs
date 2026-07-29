import { readFileSync } from "node:fs";

const template = read("../aws-account-foundation.yaml");
const workflows = [
	read("../../.github/workflows/deploy.yml"),
	read("../../.github/workflows/ai-ops-change-set.yml"),
	read("../../.github/workflows/performance-change-set.yml"),
];
const serverDeploy = read("../../apps/server/deploy-canary.sh");
const serverTemplate = read("../../apps/server/template.yaml");

assertOccurrenceCount(template, "Type: AWS::IAM::OIDCProvider", 1);
assertOccurrenceCount(template, "Type: AWS::IAM::Role", 1);

for (const fragment of [
	"ExistingGitHubOidcProviderArn:",
	"CreateGitHubOidcProvider:",
	"https://token.actions.githubusercontent.com",
	"sts.amazonaws.com",
	"repo:${GitHubRepository}:ref:refs/heads/${DeploymentBranch}",
	"AWSCloudFormationFullAccess",
	"IAMFullAccess",
	"AWSLambda_FullAccess",
	"AmazonAPIGatewayAdministrator",
	"AmazonS3FullAccess",
	"DeploymentRoleArn:",
	"AWS_DEPLOY_ROLE_ARN",
]) {
	assertIncludes(template, fragment);
}

for (const forbidden of [
	"repo:*",
	"pull_request",
	"AWS::IAM::User",
	"CreateAccessKey",
	"sts:AssumeRole\n",
]) {
	assertExcludes(template, forbidden);
}

for (const workflow of workflows) {
	assertIncludes(workflow, "role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}");
	assertIncludes(workflow, "EXPECTED_DEPLOY_ROLE_ARN: ${{ vars.AWS_DEPLOY_ROLE_ARN }}");
	assertIncludes(workflow, 'expected_role_name="${EXPECTED_DEPLOY_ROLE_ARN##*/}"');
	assertExcludes(workflow, "arn:aws:iam::879980498268:role/");
}

for (const fragment of [
	"PUBLIC_API_BASE_URL: ${{ vars.PUBLIC_API_BASE_URL }}",
	"CORS_ORIGIN: ${{ vars.CORS_ORIGIN }}",
	"LAMBDA_SUBNET_IDS: ${{ vars.AWS_LAMBDA_SUBNET_IDS }}",
	"LAMBDA_SECURITY_GROUP_IDS: ${{ vars.AWS_LAMBDA_SECURITY_GROUP_IDS }}",
]) {
	assertIncludes(workflows[0], fragment);
}

for (const fragment of [
	'parameter_overrides=(',
	'"LambdaSubnetIds=$LAMBDA_SUBNET_IDS"',
	'"LambdaSecurityGroupIds=$LAMBDA_SECURITY_GROUP_IDS"',
	'--parameter-overrides "${parameter_overrides[@]}"',
]) {
	assertIncludes(serverDeploy, fragment);
}

for (const forbidden of [
	"mdgq1tigyl.execute-api",
	"subnet-0271ef8002e00346a",
	"sg-0f1137c6844a4c9fb",
]) {
	assertExcludes(serverDeploy, forbidden);
	assertExcludes(serverTemplate, forbidden);
}

console.log(
	"AWS account foundation validated: exact GitHub branch trust and account-portable workflow role ARN",
);

function read(relativePath) {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function assertIncludes(value, expected) {
	if (!value.includes(expected)) {
		throw new Error(`expected content to contain ${JSON.stringify(expected)}`);
	}
}

function assertExcludes(value, forbidden) {
	if (value.includes(forbidden)) {
		throw new Error(`content must not contain ${JSON.stringify(forbidden)}`);
	}
}

function assertOccurrenceCount(value, expected, count) {
	const actual = value.split(expected).length - 1;
	if (actual !== count) {
		throw new Error(
			`expected ${JSON.stringify(expected)} ${count} time(s), found ${actual}`,
		);
	}
}
