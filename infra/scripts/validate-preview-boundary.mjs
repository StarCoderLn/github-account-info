import { readFileSync } from "node:fs";

const foundation = read("../go-foundation.yaml");
const iam = read("../go-iam.yaml");
const production = read("../go-production.yaml");
const preview = read("../go-preview.yaml");
const codebuild = read("../codebuild.yaml");
const previewDatabase = read("../../apps/go-api/internal/previewdb/schema.go");
const dockerfile = read("../../apps/go-api/Dockerfile");

assertOccurrenceCount(foundation, "Type: AWS::IAM::Role", 0);
assertOccurrenceCount(iam, "Type: AWS::IAM::Role", 4);
for (const content of [foundation, iam, production, preview]) {
	assertExcludes(content, "GoTaskRole");
	assertExcludes(content, "TaskRoleArn:");
}

const productionExecutionRole = resourceBlock(iam, "EcsTaskExecutionRole");
assertIncludes(productionExecutionRole, "Resource: !Ref DatabaseUrlSecretArn");
assertExcludes(productionExecutionRole, "PreviewDatabaseUrlSecretArn");

const previewExecutionRole = resourceBlock(iam, "PreviewEcsTaskExecutionRole");
assertIncludes(
	previewExecutionRole,
	"Resource: !Ref PreviewDatabaseUrlSecretArn",
);
assertExcludes(previewExecutionRole, "Resource: !Ref DatabaseUrlSecretArn");

const productionBuildRole = resourceBlock(iam, "CodeBuildRole");
assertIncludes(
	productionBuildRole,
	literal("project/{ProjectName}-production"),
);
assertIncludes(
	productionBuildRole,
	literal("stack/{ProjectName}-production/*"),
);
assertIncludes(productionBuildRole, "cloudformation:GetTemplateSummary");
assertExcludes(productionBuildRole, literal("stack/{ProjectName}-pr-"));
assertIncludes(
	productionBuildRole,
	"service/${ProjectName}/${ProjectName}-production-canary",
);
assertIncludes(
	productionBuildRole,
	literal("task-definition/{ProjectName}-production*:*")
);
assertExcludes(productionBuildRole, "PassOnlyEcsInfrastructureRole");

const previewBuildRole = resourceBlock(iam, "PreviewCodeBuildRole");
assertIncludes(previewBuildRole, literal("project/{ProjectName}-preview"));
assertIncludes(
	previewBuildRole,
	literal("project/{ProjectName}-preview-ttl-cleanup"),
);
assertIncludes(previewBuildRole, literal("stack/{ProjectName}-pr-*/*"));
assertIncludes(previewBuildRole, "cloudformation:GetTemplateSummary");
assertIncludes(previewBuildRole, "PassOnlyPreviewExecutionRole");
assertIncludes(previewBuildRole, "Service: events.amazonaws.com");
assertIncludes(
	previewBuildRole,
	literal("rule/{ProjectName}-preview-ttl-cleanup"),
);
assertIncludes(previewBuildRole, "tag:GetResources");
assertIncludes(previewBuildRole, "codebuild:StartBuild");
assertIncludes(previewBuildRole, "codebuild:BatchGetBuilds");
assertExcludes(previewBuildRole, "Resource: !GetAtt EcsTaskExecutionRole.Arn");
assertExcludes(previewBuildRole, "ecs:DeregisterTaskDefinition");
assertExcludes(previewBuildRole, "ecs:StopTask");

assertIncludes(production, "Default: 50000");
assertIncludes(preview, "MaxValue: 49999");
assertIncludes(preview, "HttpHeaderName: X-Preview-Environment");
assertIncludes(preview, "CapacityProvider: FARGATE_SPOT");
assertOccurrenceCount(preview, "DeletionPolicy: Retain", 2);
assertOccurrenceCount(preview, "UpdateReplacePolicy: Retain", 2);
assertIncludes(
	preview,
	literal("{ProjectName}-PreviewEcsTaskExecutionRoleArn"),
);
assertIncludes(preview, literal("{ProjectName}-PreviewDatabaseUrlSecretArn"));
assertExcludes(preview, literal("{ProjectName}-DatabaseUrlSecretArn"));
assertExcludes(preview, "ServiceRegistries:");
assertExcludes(preview, "CloudMap");
assertExcludes(preview, "&PreviewTags");
assertExcludes(preview, "*PreviewTags");
assertOccurrenceCount(preview, "      Tags:\n", 4);

const previewProject = resourceBlock(codebuild, "PreviewBuildProject");
assertIncludes(previewProject, "BuildSpec: |");
assertExcludes(previewProject, "BuildSpec: infra/");
assertIncludes(previewProject, "RequiresCommentApproval: ALL_PULL_REQUESTS");
assertIncludes(
	previewProject,
	"PULL_REQUEST_CREATED,PULL_REQUEST_UPDATED,PULL_REQUEST_REOPENED",
);
assertIncludes(previewProject, "PULL_REQUEST_MERGED,PULL_REQUEST_CLOSED");
assertIncludes(previewProject, "Pattern: ^refs/heads/master$");
assertIncludes(previewProject, "CODEBUILD_BUILD_SUCCEEDING");
assertIncludes(previewProject, ".codebuild-preview-image-ready");
assertIncludes(
	previewProject,
	`COMMIT_SHA="\${CODEBUILD_RESOLVED_SOURCE_VERSION:-}"`,
);
assertExcludes(previewProject, "git rev-parse HEAD^2");
assertIncludes(previewProject, `PR_NUMBER="\${CODEBUILD_SOURCE_VERSION#pr/}"`);
assertIncludes(previewProject, '[[ "$PR_NUMBER" =~ ^[1-9][0-9]{0,4}$ ]]');
assertExcludes(previewProject, `PR_NUMBER="\${BASH_REMATCH[1]}"`);
assertIncludes(previewProject, '$1 == "ARG" && $2 ~ /^GO_IMAGE=/');
assertOrdered(previewProject, [
	'if [[ "$PREVIEW_ACTION" == "deploy" ]]',
	"deploy_stack false 0",
	'run_database_task create "$DATABASE_TASK_DEFINITION"',
	"deploy_stack true 1",
	"aws ecs wait services-stable",
]);
assertOrdered(previewProject, [
	"deploy_stack false 0",
	"run_database_task drop",
	"aws cloudformation delete-stack",
]);

const ttlCleanupProject = resourceBlock(codebuild, "PreviewTtlCleanupProject");
assertIncludes(ttlCleanupProject, "Type: NO_SOURCE");
assertIncludes(ttlCleanupProject, "aws resourcegroupstaggingapi get-resources");
assertIncludes(
	ttlCleanupProject,
	['"Key=Project,Values=', "$", '{PROJECT_NAME}"'].join(""),
);
assertIncludes(ttlCleanupProject, '"Key=Environment,Values=preview"');
assertIncludes(ttlCleanupProject, "cloudformation:stack");
assertIncludes(ttlCleanupProject, "ExpiresAt");
assertIncludes(
	ttlCleanupProject,
	['"', "$", '{PROJECT_NAME}-preview"'].join(""),
);
assertIncludes(
	ttlCleanupProject,
	"name=CODEBUILD_WEBHOOK_EVENT,value=PULL_REQUEST_CLOSED,type=PLAINTEXT",
);
assertIncludes(ttlCleanupProject, '[[ "$PR_NUMBER" =~ ^[1-9][0-9]{0,4}$ ]]');
assertIncludes(ttlCleanupProject, "(( PR_NUMBER <= 49999 ))");
assertIncludes(ttlCleanupProject, "CLEANUP_FINISHED=false");
assertIncludes(ttlCleanupProject, "ConcurrentBuildLimit: 1");
assertExcludes(ttlCleanupProject, "PrivilegedMode: true");

const ttlCleanupSchedule = resourceBlock(
	codebuild,
	"PreviewTtlCleanupSchedule",
);
assertIncludes(ttlCleanupSchedule, "Type: AWS::Events::Rule");
assertIncludes(ttlCleanupSchedule, "State: ENABLED");
assertIncludes(ttlCleanupSchedule, "PreviewTtlCleanupProject.Arn");
assertIncludes(
	ttlCleanupSchedule,
	literal("{ProjectName}-PreviewCodeBuildRoleArn"),
);

assertExcludes(previewDatabase, `"public"."github_account"`);
assertIncludes(previewDatabase, "ErrUnsafeConfirmation");
assertIncludes(previewDatabase, "DROP SCHEMA IF EXISTS ");
assertIncludes(dockerfile, "/out/preview-db");
assertIncludes(dockerfile, "/preview-db");
const goBuilderImage = dockerfile.match(/^ARG GO_IMAGE=(\S+)$/m)?.[1];
if (!goBuilderImage?.includes("@sha256:")) {
	throw new Error("Dockerfile GO_IMAGE must be digest-pinned");
}

console.log(
	"Preview boundary valid: isolated runtime, deployment, and canary roles; approved PR webhook; pr-only stacks; separate secret; guarded cleanup",
);

function read(relativePath) {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function literal(value) {
	return value.replace("{ProjectName}", ["$", "{ProjectName}"].join(""));
}

function resourceBlock(template, logicalId) {
	const match = template.match(
		new RegExp(
			`^  ${logicalId}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9]+:|^Outputs:)`,
			"m",
		),
	);
	if (!match) throw new Error(`resource ${logicalId} was not found`);
	return match[0];
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

function assertOrdered(value, expectedValues) {
	let offset = 0;
	for (const expected of expectedValues) {
		const index = value.indexOf(expected, offset);
		if (index === -1) {
			throw new Error(
				`expected ${JSON.stringify(expected)} after offset ${offset}`,
			);
		}
		offset = index + expected.length;
	}
}
