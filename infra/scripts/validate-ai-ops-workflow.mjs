import { readFileSync } from "node:fs";

const workflow = readFileSync(
	new URL("../../.github/workflows/ai-ops-change-set.yml", import.meta.url),
	"utf8",
);

for (const fragment of [
	"workflow_dispatch:",
	"id-token: write",
	"vars.AWS_DEPLOY_ROLE_ARN",
	'expected_role_name="${EXPECTED_DEPLOY_ROLE_ARN##*/}"',
	":assumed-role/${expected_role_name}/",
	"create-policy-change-set",
	"execute-policy-change-set",
	"create-model-secret",
	"create-agent-change-set",
	"execute-agent-change-set",
	"delete-failed-agent-stack",
	"--change-set-type",
	"stack-create-complete",
	"stack-update-complete",
	"REVIEW_IN_PROGRESS",
	"ROLLBACK_COMPLETE",
	"aws dynamodb delete-table --table-name \"$table_name\"",
	"aws logs delete-log-group --log-group-name \"$log_group\"",
	"github-account-info-ai-ops-incidents",
	"/aws/lambda/github-account-info-ai-ops-alarm-ingest",
	"/aws/lambda/github-account-info-ai-ops-investigator",
	"Review before execution",
	"AI_OPS_GITHUB_MODELS_TOKEN",
	"AI Ops Lambda bundles import successfully",
]) {
	if (!workflow.includes(fragment)) {
		throw new Error(`AI Ops workflow is missing safety boundary: ${fragment}`);
	}
}

for (const forbidden of [
	"push:",
	"pull_request:",
	"sam deploy",
	"--no-confirm-changeset",
	"--query ChangeSetType",
]) {
	if (workflow.includes(forbidden)) {
		throw new Error(`AI Ops workflow must remain manual/change-set only: ${forbidden}`);
	}
}

console.log("AI Ops manual Change Set workflow validated");
