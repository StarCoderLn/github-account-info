import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const parseEnvFile = (contents) => {
	const values = {};

	for (const rawLine of contents.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const normalizedLine = line.startsWith("export ")
			? line.slice("export ".length)
			: line;
		const separatorIndex = normalizedLine.indexOf("=");
		if (separatorIndex < 1) continue;

		const key = normalizedLine.slice(0, separatorIndex).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;

		let value = normalizedLine.slice(separatorIndex + 1).trim();
		const quote = value.at(0);
		if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
			value = value.slice(1, -1);
		}

		values[key] = value;
	}

	return values;
};

const loadEnvFile = async (path) => {
	try {
		return parseEnvFile(await readFile(path, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") return {};
		throw error;
	}
};

const env = {
	...(await loadEnvFile(".env")),
	...(await loadEnvFile(".env.local")),
	...process.env,
};

const child = spawn("go", ["run", "./cmd/api"], {
	env,
	stdio: "inherit",
});

child.on("error", (error) => {
	console.error(`Failed to start Go API: ${error.message}`);
	process.exitCode = 1;
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exitCode = code ?? 1;
});
