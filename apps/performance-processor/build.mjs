import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
	entryPoints: ["src/index.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/index.mjs",
	banner: {
		js: `
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
`.trim(),
	},
});
