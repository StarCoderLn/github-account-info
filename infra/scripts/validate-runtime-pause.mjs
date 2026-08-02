import { readFileSync } from "node:fs";

const read = (relativePath) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

const workflow = read("../../.github/workflows/pause-once.yml");
const policy = read("../operations-pause-policy.yaml");
const production = read("../go-production.yaml");

const services = [
	"github-account-info-go-production",
	"github-account-info-go-production-canary",
	"github-account-info-performance",
	"github-account-info-go-pr-27",
	"github-account-info-go-pr-30",
	"github-account-info-go-pr-31",
	"github-account-info-go-pr-32",
	"github-account-info-go-pr-39",
];

for (const service of services) {
	if (!workflow.includes(service) || !policy.includes(service)) {
		throw new Error(`Runtime pause does not cover ${service}`);
	}
}

for (const required of [
	"create-policy-change-set",
	"execute-policy-change-set",
	"create-runtime-change-sets",
	"execute-runtime-pause",
	"vars.AWS_DEPLOY_ROLE_ARN",
	"refs/heads/master",
	"aws rds stop-db-instance",
	"aws ec2 stop-instances",
]) {
	if (!workflow.includes(required)) {
		throw new Error(`Runtime pause workflow is missing: ${required}`);
	}
}

if (!production.includes("MinValue: 0")) {
	throw new Error(
		"Production DesiredCount must allow a reviewed zero-task pause",
	);
}

if (policy.includes('Action: "*"') || policy.includes("Resource: '*'")) {
	throw new Error("Runtime pause policy must not grant wildcard actions");
}

console.log(
	"Runtime pause validated: reviewed OIDC phases cover all fixed compute resources",
);
