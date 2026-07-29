import { execFileSync } from "node:child_process";

const region = process.env.AWS_REGION?.trim() || "us-east-2";
const projectName = process.env.PROJECT_NAME?.trim() || "github-account-info";
const localPort = process.env.LOCAL_DATABASE_PORT?.trim() || "5433";
const expectedAccountId = process.env.TARGET_AWS_ACCOUNT_ID?.trim();
const dryRun = process.argv.includes("--dry-run");
const unknownArguments = process.argv.slice(2).filter((value) => value !== "--dry-run");

if (unknownArguments.length > 0) {
	throw new Error(`unknown argument(s): ${unknownArguments.join(", ")}`);
}

if (!/^[1-9][0-9]{0,4}$/.test(localPort) || Number(localPort) > 65535) {
	throw new Error("LOCAL_DATABASE_PORT must be between 1 and 65535");
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (expectedAccountId && identity.Account !== expectedAccountId) {
	throw new Error(
		`AWS identity account ${identity.Account} does not match TARGET_AWS_ACCOUNT_ID`,
	);
}

const instances = awsJson([
	"ec2",
	"describe-instances",
	"--region",
	region,
]);
const bastions = (instances.Reservations ?? [])
	.flatMap((reservation) => reservation.Instances ?? [])
	.filter((instance) => {
		const name = (instance.Tags ?? []).find((tag) => tag.Key === "Name")?.Value;
		return (
			name === `${projectName}-bastion` &&
			instance.State?.Name === "running"
		);
	});

if (bastions.length !== 1) {
	throw new Error(
		`expected exactly one running ${projectName}-bastion, found ${bastions.length}`,
	);
}

const databases = awsJson([
	"rds",
	"describe-db-instances",
	"--region",
	region,
]);
const matches = (databases.DBInstances ?? []).filter(
	(database) => database.DBInstanceIdentifier === `${projectName}-db`,
);
if (matches.length !== 1 || !matches[0].Endpoint?.Address) {
	throw new Error(`expected one available ${projectName}-db endpoint`);
}

console.log(
	`Opening SSM tunnel in AWS account ${identity.Account}: 127.0.0.1:${localPort} -> ${projectName}-db:5432`,
);

if (!dryRun) {
	execFileSync(
		"aws",
		[
			"ssm",
			"start-session",
			"--region",
			region,
			"--target",
			bastions[0].InstanceId,
			"--document-name",
			"AWS-StartPortForwardingSessionToRemoteHost",
			"--parameters",
			JSON.stringify({
				host: [matches[0].Endpoint.Address],
				portNumber: ["5432"],
				localPortNumber: [localPort],
			}),
			"--no-cli-pager",
		],
		{ stdio: "inherit" },
	);
}

function awsJson(args) {
	const stdout = execFileSync("aws", [...args, "--output", "json", "--no-cli-pager"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
	return JSON.parse(stdout);
}
