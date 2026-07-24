import { mkdirSync, rmSync } from "node:fs";

import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

await build({
	entryPoints: {
		investigate: "./src/handlers/investigate.ts",
		"alarm-ingest": "./src/handlers/alarm-ingest.ts",
	},
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outdir: "dist",
	outExtension: { ".js": ".mjs" },
	sourcemap: true,
	banner: {
		js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`.trim(),
	},
});

console.log("AI Ops Agent Lambda bundle built");
