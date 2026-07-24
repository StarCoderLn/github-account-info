import { readFileSync } from "node:fs";

const template = readFileSync(
	new URL("../ai-ops-deployer-policy.yaml", import.meta.url),
	"utf8",
);

for (const fragment of [
	"DeploymentRoleName:",
	"AWS::IAM::ManagedPolicy",
	"ManageAiOpsTable",
	"ManageAiOpsQueues",
	"ManageAiOpsLogGroups",
	"ManageAiOpsAlarms",
	"ManageAiOpsEventRules",
	"ManageGitHubModelsSecret",
]) {
	if (!template.includes(fragment)) {
		throw new Error(`AI Ops deployer policy is missing: ${fragment}`);
	}
}

for (const forbidden of [
	'"Action": "*"',
	"Action: iam:*",
	"Action: dynamodb:*",
	"Action: sqs:*",
	"Action: logs:*",
	"Action: cloudwatch:*",
	"Action: events:*",
	"Action: secretsmanager:*",
]) {
	if (template.includes(forbidden)) {
		throw new Error(`AI Ops deployer policy is too broad: ${forbidden}`);
	}
}

console.log("AI Ops deployer policy boundary validated");
