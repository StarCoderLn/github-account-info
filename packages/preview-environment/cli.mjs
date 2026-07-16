#!/usr/bin/env node

import { previewKeyFromCommitSha } from "./index.mjs";

try {
	process.stdout.write(`${previewKeyFromCommitSha(process.argv[2])}\n`);
} catch (error) {
	process.stderr.write(
		`${error instanceof Error ? error.message : "invalid preview key input"}\n`,
	);
	process.exitCode = 1;
}
