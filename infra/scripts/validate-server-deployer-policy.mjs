import { readFileSync } from "node:fs";

const template = read("../server-deployer-policy.yaml");

assertOccurrenceCount(template, "Type: AWS::IAM::ManagedPolicy", 1);
assertOccurrenceCount(template, "Type: AWS::IAM::Role", 0);
assertIncludes(template, "- !Ref DeploymentRoleName");
assertIncludes(
	template,
	["$", "{ProjectName}-server-observability-deploy"].join(""),
);
assertIncludes(template, ["log-group:$", "{AccessLogGroupName}"].join(""));
assertIncludes(template, ["alarm:$", "{ProjectName}-http-api-5xx"].join(""));

for (const action of [
	"logs:CreateLogGroup",
	"logs:PutRetentionPolicy",
	"logs:ListTagsForResource",
	"logs:TagResource",
	"logs:UntagResource",
	"logs:CreateLogDelivery",
	"logs:GetLogDelivery",
	"logs:UpdateLogDelivery",
	"logs:DeleteLogDelivery",
	"logs:ListLogDeliveries",
	"logs:PutResourcePolicy",
	"logs:DescribeResourcePolicies",
	"cloudwatch:PutMetricAlarm",
	"cloudwatch:DeleteAlarms",
	"cloudwatch:ListTagsForResource",
	"cloudwatch:TagResource",
	"cloudwatch:UntagResource",
	"cloudwatch:DescribeAlarms",
]) {
	assertIncludes(template, action);
}

for (const forbidden of [
	"CloudWatchFullAccess",
	"CloudWatchLogsFullAccess",
	'Action: "*"',
	"Action: '*'",
	"logs:DeleteLogGroup",
	"logs:GetLogEvents",
	"logs:FilterLogEvents",
]) {
	assertExcludes(template, forbidden);
}

assertOccurrenceCount(template, 'Resource: "*"', 2);

console.log(
	"Server deployer policy valid: one managed policy, no role replacement, and scoped observability permissions",
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
