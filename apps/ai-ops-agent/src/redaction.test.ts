import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactText, truncateAndRedact } from "./redaction";

describe("redaction", () => {
	it("removes credentials from log text", () => {
		const value =
			"Authorization: Bearer abcdefghijklmnopqrstuvwxyz password=hunter2 " +
			"postgres://admin:secret@db.example/app";
		const result = redactText(value);

		assert.equal(result.includes("hunter2"), false);
		assert.equal(result.includes("admin:secret"), false);
		assert.equal(result.includes("abcdefghijklmnopqrstuvwxyz"), false);
	});

	it("limits evidence size after redaction", () => {
		assert.equal(truncateAndRedact("a".repeat(2_000), 100).length, 100);
	});
});
