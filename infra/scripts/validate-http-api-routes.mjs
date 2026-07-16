import { readFileSync } from "node:fs";

const templateUrl = new URL("../../apps/server/template.yaml", import.meta.url);
const template = readFileSync(templateUrl, "utf8");

const expectedRouteKeys = [
	"ANY /trpc/{proxy+}",
	"GET /",
	"GET /api/v1/{proxy+}",
	"GET /healthz",
	"GET /readyz",
	"OPTIONS /api/v1/{proxy+}",
	"OPTIONS /trpc/{proxy+}",
].sort();

const actualRouteKeys = [...template.matchAll(/^\s+RouteKey:\s+(.+?)\s*$/gm)]
	.map((match) => match[1])
	.sort();

assertEqual(
	actualRouteKeys,
	expectedRouteKeys,
	"HTTP API route keys changed; /internal and $default routes are forbidden",
);

const goIntegration = resourceBlock("GoAlbIntegration");
assertIncludes(goIntegration, "IntegrationType: HTTP_PROXY");
assertIncludes(goIntegration, "ConnectionType: VPC_LINK");
assertIncludes(
	goIntegration,
	["$", "{ProjectName}-InternalHttpListenerArn"].join(""),
);
assertIncludes(goIntegration, '"overwrite:path": $request.path');

const lambdaIntegration = resourceBlock("LambdaIntegration");
assertIncludes(lambdaIntegration, "IntegrationType: AWS_PROXY");
assertIncludes(lambdaIntegration, 'PayloadFormatVersion: "2.0"');

console.log(`HTTP API boundary valid: ${actualRouteKeys.join(", ")}`);

function resourceBlock(logicalId) {
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
		throw new Error(
			`expected resource block to contain ${JSON.stringify(expected)}`,
		);
	}
}

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${message}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
		);
	}
}
