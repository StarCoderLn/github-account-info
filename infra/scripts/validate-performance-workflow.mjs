import { readFileSync } from "node:fs";

const workflow = readFileSync(
	new URL("../../.github/workflows/performance-change-set.yml", import.meta.url),
	"utf8",
);
const policy = readFileSync(
	new URL("../performance-deployer-policy.yaml", import.meta.url),
	"utf8",
);

for (const fragment of [
	"workflow_dispatch:",
	"id-token: write",
	"assumed-role/github-actions-deployer/",
	"create-policy-change-set",
	"execute-policy-change-set",
	"create-runtime-change-set",
	"execute-runtime-change-set",
	"push-image",
	"The first CREATE must use desired_count=0",
	"Review before execution",
	"stack-create-complete",
	"stack-update-complete",
	"performance-processor check-types",
	"performance-processor test",
	"docker push",
]) {
	if (!workflow.includes(fragment)) {
		throw new Error(`Performance workflow is missing safety boundary: ${fragment}`);
	}
}

for (const forbidden of [
	"push:",
	"pull_request:",
	"sam deploy",
	"--no-confirm-changeset",
	"aws iam create-access-key",
]) {
	if (workflow.includes(forbidden)) {
		throw new Error(`Performance workflow contains forbidden action: ${forbidden}`);
	}
}

for (const fragment of [
	"ManagePerformanceQueues",
	"ManagePerformanceRepository",
	"ManagePerformanceEcsService",
	"PassOnlyPerformanceRolesToEcs",
	"ManagePerformanceLogGroup",
	"ManagePerformanceAlarms",
	"iam:PassedToService: ecs-tasks.amazonaws.com",
]) {
	if (!policy.includes(fragment)) {
		throw new Error(`Performance deploy policy is missing: ${fragment}`);
	}
}

for (const forbidden of ["sqs:*", "ecr:*", "ecs:*", "iam:*", "logs:*"]) {
	if (policy.includes(forbidden)) {
		throw new Error(`Performance deploy policy is too broad: ${forbidden}`);
	}
}

console.log(
	"Performance manual Change Set workflow validated: OIDC-only, reviewed and default-zero",
);
