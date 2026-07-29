import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const archiveArgument = process.argv[2];
const outputArgument = process.argv[3];

if (!archiveArgument) {
	throw new Error(
		"usage: pnpm migration:restore-backup -- <archive.tar.gz.enc> [output-directory]",
	);
}

const archivePath = resolve(archiveArgument);
const manifestPath = archivePath.replace(/\.tar\.gz\.enc$/, ".manifest.json");
if (!existsSync(archivePath) || !existsSync(manifestPath)) {
	throw new Error("encrypted archive or adjacent public manifest is missing");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (sha256File(archivePath) !== manifest.archiveSha256) {
	throw new Error("encrypted archive SHA-256 does not match public manifest");
}

const outputDirectory = resolve(
	outputArgument || join(dirname(archivePath), `${manifest.backupId}-restored`),
);
if (existsSync(outputDirectory)) {
	throw new Error(`restore output already exists: ${outputDirectory}`);
}
mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });
chmodSync(outputDirectory, 0o700);

const temporaryDirectory = mkdtempSync(
	join(tmpdir(), "github-account-info-backup-restore-"),
);
const temporaryArchive = join(temporaryDirectory, "backup.tar.gz");

try {
	const passphrase = execFileSync(
		"security",
		[
			"find-generic-password",
			"-w",
			"-s",
			manifest.keychain.service,
			"-a",
			manifest.keychain.account,
		],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
	).trim();
	if (!passphrase) {
		throw new Error("backup passphrase was not found in macOS Keychain");
	}
	execFileSync(
		"openssl",
		[
			"enc",
			"-d",
			"-aes-256-cbc",
			"-pbkdf2",
			"-iter",
			"200000",
			"-in",
			archivePath,
			"-out",
			temporaryArchive,
			"-pass",
			"env:MIGRATION_BACKUP_PASSPHRASE",
		],
		{
			env: { ...process.env, MIGRATION_BACKUP_PASSPHRASE: passphrase },
			stdio: ["ignore", "ignore", "inherit"],
		},
	);
	execFileSync("tar", ["-xzf", temporaryArchive, "-C", outputDirectory], {
		stdio: "inherit",
	});

	const privateManifest = JSON.parse(
		readFileSync(join(outputDirectory, "MANIFEST.json"), "utf8"),
	);
	for (const file of privateManifest.files ?? []) {
		const restoredPath = join(outputDirectory, file.path);
		if (!existsSync(restoredPath)) {
			throw new Error(`restored file is missing: ${file.path}`);
		}
		if (
			statSync(restoredPath).size !== file.bytes ||
			sha256File(restoredPath) !== file.sha256
		) {
			throw new Error(`restored file checksum mismatch: ${file.path}`);
		}
	}
	console.log(`Verified restored backup: ${outputDirectory}`);
} catch (error) {
	rmSync(outputDirectory, { recursive: true, force: true });
	throw error;
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}

function sha256File(path) {
	const hash = createHash("sha256");
	hash.update(readFileSync(path));
	return hash.digest("hex");
}
