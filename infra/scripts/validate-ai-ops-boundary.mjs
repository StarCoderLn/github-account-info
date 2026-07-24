import { readFileSync } from "node:fs";

const template = readFileSync(
	new URL("../ai-ops.yaml", import.meta.url),
	"utf8",
);

const requiredFragments = [
	"GitHubModelsSecretArn:",
	"secretsmanager:GetSecretValue",
	"logs:StartQuery",
	"sqs:GetQueueAttributes",
	"cloudwatch:DescribeAlarms",
	"cloudformation:DescribeStackEvents",
	"BatchSize: 1",
	"MaximumConcurrency: 2",
	"RuleName: !Sub ${ProjectName}-ai-ops-cloudwatch-alarms",
	"PointInTimeRecoveryEnabled: true",
	"TimeToLiveSpecification:",
	"ReportBatchItemFailures",
];

for (const fragment of requiredFragments) {
	if (!template.includes(fragment)) {
		throw new Error(
			`AI Ops template is missing required boundary: ${fragment}`,
		);
	}
}

const forbiddenActions = [
	"ecs:UpdateService",
	"lambda:UpdateFunction",
	"sqs:PurgeQueue",
	"sqs:DeleteMessage",
	"cloudformation:UpdateStack",
	"ssm:SendCommand",
];

for (const action of forbiddenActions) {
	if (template.includes(action)) {
		throw new Error(
			`AI Ops investigator must not receive write action: ${action}`,
		);
	}
}

if (/GITHUB_MODELS_TOKEN|github_pat_|ghp_/.test(template)) {
	throw new Error("AI Ops template contains a token-like value");
}

if (template.includes("ReservedConcurrentExecutions:")) {
	throw new Error(
		"AI Ops template must preserve the account unreserved concurrency pool",
	);
}

console.log("AI Ops static security boundaries validated");
