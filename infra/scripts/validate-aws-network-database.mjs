import { readFileSync } from "node:fs";

const template = read("../aws-network-database.yaml");
const generator = read("./render-account-migration-parameters.mjs");
const tunnel = read("./start-db-tunnel.mjs");

for (const [resourceType, count] of [
	["AWS::EC2::VPC", 1],
	["AWS::EC2::Subnet", 3],
	["AWS::EC2::NatGateway", 1],
	["AWS::KMS::Key", 1],
	["AWS::SecretsManager::Secret", 1],
	["AWS::RDS::DBInstance", 1],
	["AWS::EC2::Instance", 1],
]) {
	assertOccurrenceCount(template, `    Type: ${resourceType}\n`, count);
}

for (const fragment of [
	"CreateNatGateway:",
	'Default: "true"',
	"CreateSsmBastion:",
	'Default: "false"',
	"DBSnapshotIdentifier:",
	"DatabaseBackupRetentionDays:",
	"DeletionPolicy: Snapshot",
	"UpdateReplacePolicy: Snapshot",
	"DeletionProtection:",
	"EnableKeyRotation: true",
	"DeletionPolicy: Retain",
	"GenerateSecretString:",
	"{{resolve:secretsmanager:${DatabaseMasterSecret}:SecretString:password}}",
	"MapPublicIpOnLaunch: false",
	"HttpTokens: required",
	"SourceSecurityGroupId: !Ref LambdaSecurityGroup",
	"DatabaseKmsKeyArn:",
	"PrivateSubnetIds:",
	"LambdaSecurityGroupId:",
	"RdsSecurityGroupId:",
]) {
	assertIncludes(template, fragment);
}

for (const forbidden of [
	"DatabaseMasterPassword:",
	"MasterUserPassword: !Ref",
	"MapPublicIpOnLaunch: true",
	"SecurityGroupIngress:\n        - IpProtocol: \"-1\"",
	"CidrIp: 0.0.0.0/0\n      Description: PostgreSQL",
]) {
	assertExcludes(template, forbidden);
}

for (const fragment of [
	'TARGET_AWS_ACCOUNT_ID',
	'identity.Account !== targetAccountId',
	'PRODUCTION_DATABASE_SECRET_ARN',
	'PREVIEW_DATABASE_SECRET_ARN',
	'DeploymentRoleArn',
	'PrivateSubnetIds',
	'go-foundation.local.json',
	'go-iam.local.json',
	'migration-target.local.json',
	'{ mode: 0o600 }',
	'chmodSync(filePath, 0o600)',
	'No secret values were read or written.',
]) {
	assertIncludes(generator, fragment);
}

for (const forbidden of [
	"get-secret-value",
	"GetSecretValue",
	"gh variable set",
	"shell: true",
]) {
	assertExcludes(generator, forbidden);
}

for (const fragment of [
	"describe-instances",
	"describe-db-instances",
	'`${projectName}-bastion`',
	'`${projectName}-db`',
	"AWS-StartPortForwardingSessionToRemoteHost",
	"TARGET_AWS_ACCOUNT_ID",
	'process.argv.includes("--dry-run")',
	'{ stdio: "inherit" }',
]) {
	assertIncludes(tunnel, fragment);
}

for (const forbidden of [
	"i-0fe5bdd02a913b64a",
	"github-account-info-db.c5euaaqk2x7x",
	"shell: true",
]) {
	assertExcludes(tunnel, forbidden);
}

console.log(
	"AWS network/database foundation validated: private RDS, generated credentials, snapshot-safe KMS, optional NAT and zero-ingress SSM",
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
