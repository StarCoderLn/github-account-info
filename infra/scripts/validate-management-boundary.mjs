import { readFileSync } from "node:fs";

const serverTemplate = read("../../apps/server/template.yaml");
const serverEnv = read("../../packages/env/src/server.ts");
const apiIndex = read("../../packages/api/src/index.ts");
const accountRouter = read("../../packages/api/src/routers/account.ts");
const githubRouter = read("../../packages/api/src/routers/github.ts");
const introductionRouter = read(
	"../../packages/api/src/routers/introduction-router.ts",
);

assertIncludes(serverTemplate, 'MANAGEMENT_API_ENABLED: "false"');
assertIncludes(serverTemplate, "NODE_ENV: production");
assertIncludes(serverEnv, "MANAGEMENT_API_ENABLED:");
assertIncludes(serverEnv, ".default(false)");
assertIncludes(apiIndex, 'code: "FORBIDDEN"');

for (const router of [accountRouter, githubRouter, introductionRouter]) {
	assertIncludes(router, "managementProcedure");
	assertExcludes(router, "publicProcedure");
}

assertOccurrenceCount(accountRouter, "managementProcedure", 6);
assertOccurrenceCount(githubRouter, "managementProcedure", 2);
assertOccurrenceCount(introductionRouter, "managementProcedure", 2);

console.log(
	"Management boundary valid: production tRPC management procedures fail closed",
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
