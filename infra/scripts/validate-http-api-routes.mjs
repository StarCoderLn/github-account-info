import { readFileSync } from "node:fs";

const templateUrl = new URL("../../apps/server/template.yaml", import.meta.url);
const template = readFileSync(templateUrl, "utf8");
const foundationTemplate = readFileSync(
	new URL("../go-foundation.yaml", import.meta.url),
	"utf8",
);

const expectedRouteKeys = [
	"ANY /trpc/{proxy+}",
	"GET /",
	"GET /api/v1/{proxy+}",
	"GET /healthz",
	"GET /readyz",
	"OPTIONS /api/v1/{proxy+}",
	"OPTIONS /trpc/{proxy+}",
].sort();

const api = resourceBlock("ServerlessHttpApi");
const actualRouteKeys = openApiRouteKeys(api).sort();

assertEqual(
	actualRouteKeys,
	expectedRouteKeys,
	"HTTP API route keys changed; /internal and $default routes are forbidden",
);

assertIncludes(api, "type: http_proxy");
assertIncludes(api, "connectionType: VPC_LINK");
assertIncludes(api, ["$", "{ProjectName}-InternalHttpListenerArn"].join(""));
assertIncludes(api, 'overwrite:path: "$request.path"');
assertIncludes(api, "connectionId: !Ref GoApiVpcLink");
assertIncludes(api, "httpMethod: GET");
assertIncludes(api, "httpMethod: OPTIONS");
assertExcludes(api, "httpMethod: ANY");

assertIncludes(api, "type: aws_proxy");
assertIncludes(api, 'payloadFormatVersion: "2.0"');
assertExcludes(api, "ProtocolType:");
assertExcludes(template, "Type: AWS::ApiGatewayV2::Route");
assertMatches(
	foundationTemplate,
	/routing\.http\.desync_mitigation_mode[\s\S]*?Value: defensive/,
);
assertExcludes(
	foundationTemplate,
	"routing.http.desync_mitigation_mode\n          Value: strictest",
);

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

function openApiRouteKeys(apiBlock) {
	const routes = [];
	let currentPath;

	for (const line of apiBlock.split("\n")) {
		const pathMatch = line.match(/^ {10}"([^"]+)":\s*$/);
		if (pathMatch) {
			currentPath = pathMatch[1];
			continue;
		}

		const methodMatch = line.match(
			/^ {12}(get|options|x-amazon-apigateway-any-method):\s*$/,
		);
		if (!currentPath || !methodMatch) continue;

		const method =
			methodMatch[1] === "x-amazon-apigateway-any-method"
				? "ANY"
				: methodMatch[1].toUpperCase();
		routes.push(`${method} ${currentPath}`);
	}

	return routes;
}

function assertIncludes(value, expected) {
	if (!value.includes(expected)) {
		throw new Error(
			`expected resource block to contain ${JSON.stringify(expected)}`,
		);
	}
}

function assertExcludes(value, forbidden) {
	if (value.includes(forbidden)) {
		throw new Error(`expected value to exclude ${JSON.stringify(forbidden)}`);
	}
}

function assertMatches(value, expected) {
	if (!expected.test(value)) {
		throw new Error(`expected value to match ${expected}`);
	}
}

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${message}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
		);
	}
}
