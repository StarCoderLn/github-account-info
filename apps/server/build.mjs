import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

await build({
	entryPoints: ["./src/lambda.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/lambda.mjs",
	banner: {
		js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`.trim(),
	},
});

console.log("Build complete: dist/lambda.mjs");
