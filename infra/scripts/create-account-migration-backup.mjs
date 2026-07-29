import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const environment = (name) => process.env[name]?.trim();
const region = environment("AWS_REGION") || "us-east-2";
const projectName = environment("PROJECT_NAME") || "github-account-info";
const expectedAccountId = environment("SOURCE_AWS_ACCOUNT_ID");
const localPort = environment("LOCAL_DATABASE_PORT") || "5433";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const backupRoot = resolve(
	environment("BACKUP_OUTPUT_DIR") || join(repositoryRoot, ".local-backups"),
);
const keychainService = `${projectName}-aws-migration-backup`;
const productionSecretName = `${projectName}/production/database-url`;
const previewSecretName = `${projectName}/preview/database-url`;

if (!expectedAccountId || !/^[0-9]{12}$/.test(expectedAccountId)) {
	throw new Error(
		"SOURCE_AWS_ACCOUNT_ID must be the 12-digit source account ID",
	);
}
if (!/^[1-9][0-9]{0,4}$/.test(localPort) || Number(localPort) > 65535) {
	throw new Error("LOCAL_DATABASE_PORT must be between 1 and 65535");
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== expectedAccountId) {
	throw new Error(
		`AWS identity account ${identity.Account} does not match SOURCE_AWS_ACCOUNT_ID`,
	);
}

const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const backupId = `${projectName}-${expectedAccountId}-${timestamp}`;
mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
chmodSync(backupRoot, 0o700);

const stagingDirectory = mkdtempSync(join(backupRoot, ".staging-"));
chmodSync(stagingDirectory, 0o700);
const temporaryArchive = join(backupRoot, `.${backupId}.tar.gz`);
const encryptedArchive = join(backupRoot, `${backupId}.tar.gz.enc`);
const publicManifestPath = join(backupRoot, `${backupId}.manifest.json`);
let tunnelProcess;

try {
	const database = discoverDatabase();
	const bastionId = discoverBastionId();
	const pgDump = resolvePostgresTool("pg_dump");
	const pgRestore = resolvePostgresTool("pg_restore");

	console.log(
		`Opening temporary SSM tunnel for source account ${expectedAccountId}`,
	);
	tunnelProcess = spawn(
		"aws",
		[
			"ssm",
			"start-session",
			"--region",
			region,
			"--target",
			bastionId,
			"--document-name",
			"AWS-StartPortForwardingSessionToRemoteHost",
			"--parameters",
			JSON.stringify({
				host: [database.Endpoint.Address],
				portNumber: ["5432"],
				localPortNumber: [localPort],
			}),
			"--no-cli-pager",
		],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
	await waitForPort(Number(localPort), tunnelProcess);

	const databaseDirectory = join(stagingDirectory, "postgres");
	mkdirSync(databaseDirectory, { mode: 0o700 });
	for (const [label, secretName] of [
		["production", productionSecretName],
		["preview", previewSecretName],
	]) {
		const databaseUrl = readDatabaseUrl(secretName);
		const parsedUrl = new URL(databaseUrl);
		if (parsedUrl.hostname !== database.Endpoint.Address) {
			throw new Error(
				`${label} database secret does not reference the discovered RDS endpoint`,
			);
		}
		const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
		if (!databaseName) {
			throw new Error(`${label} database URL has no database name`);
		}
		const dumpPath = join(databaseDirectory, `${label}.dump`);
		runChecked(
			pgDump,
			[
				"--host",
				"127.0.0.1",
				"--port",
				localPort,
				"--username",
				decodeURIComponent(parsedUrl.username),
				"--dbname",
				databaseName,
				"--format",
				"custom",
				"--no-owner",
				"--no-privileges",
				"--file",
				dumpPath,
			],
			{
				...process.env,
				PGPASSWORD: decodeURIComponent(parsedUrl.password),
				PGSSLMODE: "require",
			},
		);
		chmodSync(dumpPath, 0o600);
		runChecked(pgRestore, ["--list", dumpPath], process.env, {
			stdio: ["ignore", "ignore", "inherit"],
		});
		console.log(`Verified PostgreSQL ${label} custom-format dump`);
	}

	exportDynamoDb(stagingDirectory);
	exportInventory(stagingDirectory, database);

	const privateManifest = {
		schemaVersion: 1,
		backupId,
		createdAt: new Date().toISOString(),
		sourceAccountId: expectedAccountId,
		region,
		projectName,
		files: collectFileChecksums(stagingDirectory),
	};
	writeJson(join(stagingDirectory, "MANIFEST.json"), privateManifest);

	runChecked(
		"tar",
		["-czf", temporaryArchive, "-C", stagingDirectory, "."],
		process.env,
	);
	chmodSync(temporaryArchive, 0o600);

	const passphrase = randomBytes(32).toString("base64url");
	runChecked(
		"security",
		[
			"add-generic-password",
			"-U",
			"-s",
			keychainService,
			"-a",
			backupId,
			"-w",
			passphrase,
		],
		process.env,
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
	runChecked(
		"openssl",
		[
			"enc",
			"-aes-256-cbc",
			"-salt",
			"-pbkdf2",
			"-iter",
			"200000",
			"-in",
			temporaryArchive,
			"-out",
			encryptedArchive,
			"-pass",
			"env:MIGRATION_BACKUP_PASSPHRASE",
		],
		{ ...process.env, MIGRATION_BACKUP_PASSPHRASE: passphrase },
	);
	chmodSync(encryptedArchive, 0o600);

	const publicManifest = {
		schemaVersion: 1,
		backupId,
		createdAt: privateManifest.createdAt,
		sourceAccountId: expectedAccountId,
		region,
		archiveFile: basename(encryptedArchive),
		archiveBytes: statSync(encryptedArchive).size,
		archiveSha256: sha256File(encryptedArchive),
		keychain: {
			service: keychainService,
			account: backupId,
		},
		restoreCommand: `corepack pnpm migration:restore-backup -- ${encryptedArchive}`,
	};
	writeJson(publicManifestPath, publicManifest);

	console.log(`Encrypted migration backup: ${encryptedArchive}`);
	console.log(`Public checksum manifest: ${publicManifestPath}`);
	console.log(
		`Encryption key stored in macOS Keychain service ${keychainService}, account ${backupId}`,
	);
} finally {
	if (tunnelProcess && tunnelProcess.exitCode === null) {
		tunnelProcess.kill("SIGTERM");
	}
	rmSync(stagingDirectory, { recursive: true, force: true });
	rmSync(temporaryArchive, { force: true });
}

function discoverDatabase() {
	const databases = awsJson([
		"rds",
		"describe-db-instances",
		"--region",
		region,
	]);
	const matches = (databases.DBInstances ?? []).filter(
		(database) =>
			database.DBInstanceIdentifier === `${projectName}-db` &&
			database.DBInstanceStatus === "available",
	);
	if (matches.length !== 1 || !matches[0].Endpoint?.Address) {
		throw new Error(`expected one available ${projectName}-db`);
	}
	return matches[0];
}

function discoverBastionId() {
	const response = awsJson(["ec2", "describe-instances", "--region", region]);
	const matches = (response.Reservations ?? [])
		.flatMap((reservation) => reservation.Instances ?? [])
		.filter((instance) => {
			const name = (instance.Tags ?? []).find(
				(tag) => tag.Key === "Name",
			)?.Value;
			return (
				name === `${projectName}-bastion` && instance.State?.Name === "running"
			);
		});
	if (matches.length !== 1) {
		throw new Error(
			`expected exactly one running ${projectName}-bastion, found ${matches.length}`,
		);
	}
	return matches[0].InstanceId;
}

function readDatabaseUrl(secretName) {
	const secret = awsJson([
		"secretsmanager",
		"get-secret-value",
		"--region",
		region,
		"--secret-id",
		secretName,
	]);
	const rawValue = secret.SecretString;
	if (typeof rawValue !== "string" || rawValue.length === 0) {
		throw new Error(`secret ${secretName} has no SecretString`);
	}
	if (
		rawValue.startsWith("postgres://") ||
		rawValue.startsWith("postgresql://")
	) {
		return rawValue;
	}
	let parsed;
	try {
		parsed = JSON.parse(rawValue);
	} catch {
		throw new Error(`secret ${secretName} is not a PostgreSQL URL or JSON`);
	}
	for (const key of [
		"DATABASE_URL",
		"databaseUrl",
		"url",
		"connectionString",
	]) {
		if (
			typeof parsed?.[key] === "string" &&
			(parsed[key].startsWith("postgres://") ||
				parsed[key].startsWith("postgresql://"))
		) {
			return parsed[key];
		}
	}
	throw new Error(`secret ${secretName} contains no recognized PostgreSQL URL`);
}

function exportDynamoDb(outputDirectory) {
	const dynamoDirectory = join(outputDirectory, "dynamodb");
	mkdirSync(dynamoDirectory, { mode: 0o700 });
	const response = awsJson(["dynamodb", "list-tables", "--region", region]);
	const tables = (response.TableNames ?? []).filter((name) =>
		name.startsWith(projectName),
	);
	for (const tableName of tables) {
		const tableDirectory = join(dynamoDirectory, tableName);
		mkdirSync(tableDirectory, { mode: 0o700 });
		writeJson(
			join(tableDirectory, "items.json"),
			awsJson([
				"dynamodb",
				"scan",
				"--region",
				region,
				"--table-name",
				tableName,
			]),
		);
		writeJson(
			join(tableDirectory, "table.json"),
			awsJson([
				"dynamodb",
				"describe-table",
				"--region",
				region,
				"--table-name",
				tableName,
			]),
		);
		writeJson(
			join(tableDirectory, "continuous-backups.json"),
			awsJson([
				"dynamodb",
				"describe-continuous-backups",
				"--region",
				region,
				"--table-name",
				tableName,
			]),
		);
		console.log(`Exported DynamoDB table ${tableName}`);
	}
}

function exportInventory(outputDirectory, database) {
	const inventoryDirectory = join(outputDirectory, "inventory");
	mkdirSync(inventoryDirectory, { mode: 0o700 });
	writeJson(join(inventoryDirectory, "identity.json"), {
		Account: identity.Account,
		Arn: identity.Arn,
	});
	writeJson(join(inventoryDirectory, "rds.json"), {
		DBInstanceIdentifier: database.DBInstanceIdentifier,
		Engine: database.Engine,
		EngineVersion: database.EngineVersion,
		DBInstanceClass: database.DBInstanceClass,
		AllocatedStorage: database.AllocatedStorage,
		StorageType: database.StorageType,
		StorageEncrypted: database.StorageEncrypted,
		KmsKeyId: database.KmsKeyId,
		BackupRetentionPeriod: database.BackupRetentionPeriod,
		DeletionProtection: database.DeletionProtection,
		Endpoint: database.Endpoint,
		DBSubnetGroup: database.DBSubnetGroup?.DBSubnetGroupName,
		VpcSecurityGroups: database.VpcSecurityGroups?.map(
			(group) => group.VpcSecurityGroupId,
		),
	});
	writeJson(
		join(inventoryDirectory, "cloudformation-stacks.json"),
		awsJson([
			"cloudformation",
			"describe-stacks",
			"--region",
			region,
			"--query",
			"Stacks[].{StackName:StackName,StackStatus:StackStatus,Outputs:Outputs}",
		]),
	);
	writeJson(
		join(inventoryDirectory, "secrets-metadata.json"),
		awsJson([
			"secretsmanager",
			"list-secrets",
			"--region",
			region,
			"--query",
			`SecretList[?contains(Name, '${projectName}')].{Name:Name,ARN:ARN,LastChangedDate:LastChangedDate}`,
		]),
	);
	writePrivate(
		join(inventoryDirectory, "github-variables.tsv"),
		execText("gh", ["variable", "list"]),
	);
	writePrivate(
		join(inventoryDirectory, "github-secrets.tsv"),
		execText("gh", ["secret", "list"]),
	);
}

function resolvePostgresTool(name) {
	const candidates = [
		environment(`${name.toUpperCase()}_BIN`),
		`/usr/local/opt/libpq/bin/${name}`,
		`/opt/homebrew/opt/libpq/bin/${name}`,
		name,
	].filter(Boolean);
	for (const candidate of candidates) {
		const result = spawnSync(candidate, ["--version"], {
			stdio: "ignore",
		});
		if (result.status === 0) {
			return candidate;
		}
	}
	throw new Error(`${name} was not found; install Homebrew libpq first`);
}

async function waitForPort(port, processHandle) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (processHandle.exitCode !== null) {
			throw new Error("SSM tunnel exited before becoming ready");
		}
		if (await canConnect(port)) {
			return;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
	}
	throw new Error(
		`SSM tunnel did not open local port ${port} within 30 seconds`,
	);
}

function canConnect(port) {
	return new Promise((resolvePromise) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		socket.setTimeout(500);
		socket.once("connect", () => {
			socket.destroy();
			resolvePromise(true);
		});
		const fail = () => {
			socket.destroy();
			resolvePromise(false);
		};
		socket.once("error", fail);
		socket.once("timeout", fail);
	});
}

function awsJson(args) {
	return JSON.parse(
		execText("aws", [...args, "--output", "json", "--no-cli-pager"]),
	);
}

function execText(command, args) {
	return execFileSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
		maxBuffer: 100 * 1024 * 1024,
	});
}

function runChecked(command, args, env, options = {}) {
	const result = spawnSync(command, args, {
		env,
		stdio: options.stdio ?? "inherit",
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`${basename(command)} failed with exit code ${result.status}`,
		);
	}
}

function writeJson(path, value) {
	writePrivate(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writePrivate(path, value) {
	writeFileSync(path, value, { encoding: "utf8", mode: 0o600 });
	chmodSync(path, 0o600);
}

function collectFileChecksums(directory, prefix = "") {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const relativePath = join(prefix, entry.name);
		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFileChecksums(absolutePath, relativePath));
		} else if (entry.isFile()) {
			files.push({
				path: relativePath,
				bytes: statSync(absolutePath).size,
				sha256: sha256File(absolutePath),
			});
		}
	}
	return files.sort((left, right) => left.path.localeCompare(right.path));
}

function sha256File(path) {
	const hash = createHash("sha256");
	hash.update(readFileSync(path));
	return hash.digest("hex");
}
