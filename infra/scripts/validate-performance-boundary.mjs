import { readFileSync } from "node:fs";

const performance = read("../performance.yaml");
const deployerPolicy = read("../performance-deployer-policy.yaml");
const server = read("../../apps/server/template.yaml");
const deployScript = read("../../apps/server/deploy-canary.sh");

for (const expected of [
	"PerformanceQueue:",
	"PerformanceDeadLetterQueue:",
	"SqsManagedSseEnabled: true",
	"maxReceiveCount: 5",
	"ReceiveMessageWaitTimeSeconds: 20",
	"PerformanceTaskDefinition:",
	"PerformanceService:",
	"PerformanceScalableTarget:",
	// 最小容量必须与运行参数同步：1 表示准实时常驻，0 表示可缩容到零。
	"MinCapacity: !Ref DesiredCount",
	"MaxCapacity: 1",
	"PerformanceQueueBacklogAlarm:",
	"PerformanceQueueDrainedAlarm:",
	"ApproximateNumberOfMessagesNotVisible",
	"DesiredCount:",
	"AssignPublicIp: DISABLED",
	"ReadonlyRootFilesystem: true",
	"consume-only-performance-queue",
	"PERFORMANCE_QUEUE_URL",
	"PerformanceDeadLetterAlarm:",
	"PerformanceQueueAgeAlarm:",
]) {
	assertIncludes(performance, expected);
}

assertOccurrenceCount(performance, "Type: AWS::SQS::Queue\n", 2);
assertOccurrenceCount(performance, "Type: AWS::CloudWatch::Alarm", 4);
assertOccurrenceCount(performance, "SqsManagedSseEnabled: true", 2);

for (const forbidden of [
	"sqs:*",
	"sqs:PurgeQueue",
	"sqs:StartMessageMoveTask",
	"AssignPublicIp: ENABLED",
	"alias/aws/sqs",
]) {
	if (performance.includes(forbidden)) {
		throw new Error(
			`performance boundary contains forbidden value ${forbidden}`,
		);
	}
}

for (const expected of [
	"ManageOnlyPerformanceEcsAutoScaling",
	"application-autoscaling:RegisterScalableTarget",
	"application-autoscaling:PutScalingPolicy",
	"application-autoscaling:service-namespace: ecs",
	"application-autoscaling:scalable-dimension: ecs:service:DesiredCount",
	"CreateOnlyEcsAutoScalingServiceLinkedRole",
	"iam:AWSServiceName: ecs.application-autoscaling.amazonaws.com",
	"ProjectName}-queue-scale-out",
	"ProjectName}-queue-scale-in",
]) {
	assertIncludes(deployerPolicy, expected);
}

for (const forbidden of [
	"application-autoscaling:*",
	"iam:*",
	"ecs:*",
	"cloudwatch:*",
]) {
	if (deployerPolicy.includes(forbidden)) {
		throw new Error(
			`performance deployer policy contains forbidden value ${forbidden}`,
		);
	}
}

for (const expected of [
	'"/api/v1/performance/events":',
	"PerformanceQueueUrl:",
	"PerformanceQueueArn:",
	"SendOnlyConfiguredPerformanceQueue",
	"Action: sqs:SendMessage",
]) {
	assertIncludes(server, expected);
}

assertIncludes(
	deployScript,
	'PERFORMANCE_STACK_NAME="github-account-info-performance"',
);
assertIncludes(deployScript, "read_performance_output PerformanceQueueUrl");
assertIncludes(deployScript, "read_performance_output PerformanceQueueArn");

console.log(
	"Performance observability boundary valid: credential-free ingest, SQS/DLQ, isolated ECS cleaner and least privilege",
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
