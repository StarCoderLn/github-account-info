import { readFileSync } from "node:fs";

// 这是 IaC 结构边界测试，不访问 AWS。它防止后续重构时意外删掉 DLQ、
// partial batch retry、第二个 Target Group 或告警等生产安全护栏。
const foundation = read("../go-foundation.yaml");
const production = read("../go-production.yaml");
const server = read("../../apps/server/template.yaml");
const profileEvents = read("../profile-events.yaml");
const synthetics = read("../synthetics.yaml");

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
assertIncludes(
	production,
	"ProductionAlternateTargetGroup.TargetGroupFullName",
);
assertIncludes(production, "Namespace: ECS/ContainerInsights");
assertIncludes(production, "Namespace: AWS/ECS");
assertIncludes(production, "TreatMissingData: breaching");
assertOccurrenceCount(production, "Type: AWS::ECS::Service", 2);
assertOccurrenceCount(production, "ServiceRegistries:", 1);
assertIncludes(production, "ProductionCanaryService:");
assertIncludes(production, "CanaryDesiredCount:");
assertIncludes(production, "StableTrafficWeight:");
assertIncludes(production, "CanaryTrafficWeight:");
assertIncludes(production, "ForwardConfig:");
assertIncludes(production, "AlternateTargetGroupArn:");
if (
	production.includes("Strategy: CANARY") ||
	production.includes("AdvancedConfiguration:")
) {
	// Stable Service 注册了 Cloud Map，AWS 当前不允许它使用 ECS 原生 CANARY。
	// 本项目必须保持“双 Service + 双 Target Group”的外部灰度实现。
	throw new Error(
		"Cloud Map service must not use ECS native canary deployment",
	);
}
assertIncludes(server, "Namespace: AWS/ApiGateway");
assertIncludes(server, "MetricName: 5xx");

assertOccurrenceCount(profileEvents, "Type: AWS::SNS::Topic", 1);
assertOccurrenceCount(profileEvents, "Type: AWS::SQS::Queue\n", 2);
assertOccurrenceCount(profileEvents, "Type: AWS::SNS::Subscription", 1);
assertIncludes(profileEvents, "maxReceiveCount: 5");
assertIncludes(profileEvents, "ReportBatchItemFailures");
assertIncludes(profileEvents, "ProfileEventsDeadLetterQueue.Arn");
assertIncludes(profileEvents, "PUBLIC_API_URL: !Ref PublicApiUrl");
assertOccurrenceCount(profileEvents, "SqsManagedSseEnabled: true", 2);
if (profileEvents.includes("KmsMasterKeyId: alias/aws/sqs")) {
	// alias/aws/sqs 的 key policy 不能授权 SNS 生成 data key，会造成静默投递失败。
	throw new Error(
		"SNS subscriptions cannot deliver to alias/aws/sqs encrypted queues",
	);
}
assertOccurrenceCount(profileEvents, "Type: AWS::CloudWatch::Alarm", 2);

assertOccurrenceCount(synthetics, "Type: AWS::Synthetics::Canary", 1);
assertIncludes(synthetics, "StartCanaryAfterCreation:");
assertIncludes(synthetics, 'Default: "true"');
assertIncludes(synthetics, 'path: "/healthz"');
assertIncludes(synthetics, 'path: "/readyz"');
assertOccurrenceCount(synthetics, "Type: AWS::CloudWatch::Alarm", 1);

for (const template of [production, server]) {
	assertIncludes(template, "AlarmTopicArn:");
	assertIncludes(template, "HasAlarmTopic:");
	assertIncludes(
		template,
		"!If [HasAlarmTopic, !Ref AlarmTopicArn, !Ref AWS::NoValue]",
	);
}

console.log(
	"Operational resilience valid: API/ECS canaries, Synthetics, SNS/SQS/DLQ, and alarms",
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
