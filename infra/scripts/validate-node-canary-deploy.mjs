import { readFileSync } from "node:fs";

const deployScript = readFileSync(
	new URL("../../apps/server/deploy-canary.sh", import.meta.url),
	"utf8",
);

const noOpGuard =
	'grep -Fq "No changes to deploy. Stack $' + '{STACK_NAME} is up to date"';

const requiredSnippets = [
	'readonly STACK_NAME="github-account-info"',
	'2>&1 | tee "$sam_output_file"',
	noOpGuard,
	"smoke_once /",
	"smoke_once /healthz",
	"smoke_once /readyz",
	"Lambda deployment is already up to date; live alias unchanged",
];

for (const snippet of requiredSnippets) {
	if (!deployScript.includes(snippet)) {
		throw new Error(`Node canary deploy is missing no-op guard: ${snippet}`);
	}
}

const noOpGuardIndex = deployScript.indexOf(noOpGuard);
const publishCandidateIndex = deployScript.indexOf(
	'--description "native alias canary candidate"',
);

if (noOpGuardIndex === -1 || publishCandidateIndex === -1) {
	throw new Error(
		"Node canary deploy guard or candidate publish step is missing",
	);
}

if (noOpGuardIndex > publishCandidateIndex) {
	throw new Error(
		"Node canary deploy must handle an empty SAM deployment before publishing a candidate",
	);
}

console.log(
	"Node canary deployment validated: empty SAM updates keep the live alias and verify public probes",
);
