import { readFileSync } from "node:fs";

// 同时约束 webhook、buildspec、镜像可追溯性和发布脚本四阶段。这里只做静态
// 边界检查，真实的 Service/Target 健康状态仍由部署脚本和 AWS waiter 验证。
const buildspec = readFileSync(
	new URL("../buildspec/go-production.yml", import.meta.url),
	"utf8",
);
const template = readFileSync(
	new URL("../codebuild.yaml", import.meta.url),
	"utf8",
);
const deployScript = readFileSync(
	new URL("./deploy-go-production.sh", import.meta.url),
	"utf8",
);
const dockerfile = readFileSync(
	new URL("../../apps/go-api/Dockerfile", import.meta.url),
	"utf8",
);

assertIncludes(template, "Pattern: ^refs/heads/master$");
assertIncludes(template, "Pattern: PUSH");
assertIncludes(template, "BuildSpec: infra/buildspec/go-production.yml");
assertIncludes(template, "ConcurrentBuildLimit: 1");

const deployCommand = 'infra/scripts/deploy-go-production.sh "$IMAGE_TAG"';
assertOccurrenceCount(buildspec, deployCommand, 1);
assertOrdered(buildspec, [
	"post_build:",
	"CODEBUILD_BUILD_SUCCEEDING",
	".codebuild-production-image-ready",
	deployCommand,
]);
assertIncludes(buildspec, "go vet ./...");
assertIncludes(buildspec, "go test ./...");
assertIncludes(buildspec, '$1 == "ARG" && $2 ~ /^GO_IMAGE=/');
assertIncludes(buildspec, 'docker push "$IMAGE_URI"');
assertIncludes(buildspec, "aws ecr describe-images");

const goBuilderImage = dockerfile.match(/^ARG GO_IMAGE=(\S+)$/m)?.[1];
if (!goBuilderImage?.includes("@sha256:")) {
	throw new Error("Dockerfile GO_IMAGE must be digest-pinned");
}

assertIncludes(deployScript, "aws ecs wait services-stable");
assertIncludes(deployScript, "smoke_test /healthz");
assertIncludes(deployScript, "smoke_test /readyz");
assertIncludes(
	deployScript,
	'deploy_release "$previous_image_tag" "$IMAGE_TAG" 90 10 1',
);
assertIncludes(
	deployScript,
	'deploy_release "$previous_image_tag" "$IMAGE_TAG" 0 100 1',
);
assertIncludes(
	deployScript,
	'deploy_release "$IMAGE_TAG" "$IMAGE_TAG" 100 0 0',
);
assertIncludes(deployScript, "wait_for_canary_target");
assertIncludes(deployScript, "observe_canary");
assertIncludes(deployScript, "restore_previous_release");
assertIncludes(
	deployScript,
	"unable to determine whether the production stack exists",
);
if (/\bjq\b/.test(deployScript)) {
	throw new Error("production deployment script must not depend on jq");
}

console.log(
	"Production CodeBuild boundary valid: trusted master push, verified image, stable ECS service, smoke-test rollback",
);

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
