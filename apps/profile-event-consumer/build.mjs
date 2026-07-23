import { mkdirSync, rmSync } from "node:fs";

import { build } from "esbuild";

// dist 是 SAM CodeUri；每次先清空可避免已删除的旧 chunk 被一起上传。
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

await build({
	entryPoints: ["./src/lambda.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/lambda.mjs",
	sourcemap: true,
	banner: {
		// bundle 输出 ESM，但部分依赖仍在运行时调用 require；在 Node 22 Lambda
		// 中显式创建 require，兼容这些 CommonJS 依赖。
		js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`.trim(),
	},
});

console.log("Profile event consumer Lambda bundle built");
