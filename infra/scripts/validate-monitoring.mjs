import { readFileSync } from "node:fs";

const foundation = read("../go-foundation.yaml");
const production = read("../go-production.yaml");
const server = read("../../apps/server/template.yaml");

assertIncludes(foundation, "InternalLoadBalancer.LoadBalancerFullName");
assertIncludes(
	foundation,
	["$", "{ProjectName}-InternalLoadBalancerFullName"].join(""),
);
assertOccurrenceCount(production, "Type: AWS::CloudWatch::Alarm", 4);
assertOccurrenceCount(server, "Type: AWS::CloudWatch::Alarm", 1);

for (const expected of [
	"MetricName: UnHealthyHostCount",
	"MetricName: HTTPCode_Target_5XX_Count",
	"MetricName: RunningTaskCount",
	"MetricName: CPUUtilization",
]) {
	assertIncludes(production, expected);
}

assertIncludes(production, "Namespace: AWS/ApplicationELB");
assertIncludes(production, "Namespace: ECS/ContainerInsights");
assertIncludes(production, "Namespace: AWS/ECS");
assertIncludes(production, "TreatMissingData: breaching");
assertIncludes(server, "Namespace: AWS/ApiGateway");
assertIncludes(server, "MetricName: 5xx");

for (const template of [production, server]) {
	assertIncludes(template, "AlarmTopicArn:");
	assertIncludes(template, "HasAlarmTopic:");
	assertIncludes(
		template,
		"!If [HasAlarmTopic, !Ref AlarmTopicArn, !Ref AWS::NoValue]",
	);
}

console.log(
	"Monitoring boundary valid: ALB, ECS, and HTTP API alarms with optional SNS notifications",
);

function read(relativePath) {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function assertIncludes(value, expected) {
	if (!value.includes(expected)) {
		throw new Error(`expected content to contain ${JSON.stringify(expected)}`);
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
