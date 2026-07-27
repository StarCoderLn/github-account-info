import assert from "node:assert/strict";
import test from "node:test";

import {
	sanitizeMessage,
	sanitizeResourceName,
	sanitizeRoute,
} from "./sanitize";

test("removes query and normalizes known dynamic routes", () => {
	assert.equal(
		sanitizeRoute("https://example.com/u/alice?token=secret#profile"),
		"/u/:username",
	);
	assert.equal(sanitizeRoute("/accounts/42?tab=private"), "/accounts/:id");
});

test("redacts common credential shapes from error messages", () => {
	const message = sanitizeMessage(
		"request failed Authorization: Bearer abc.def.ghi token=ghp_abcdefghijklmnopqrstuvwxyz",
	);
	assert.equal(message.includes("ghp_"), false);
	assert.equal(message.includes("Bearer abc"), false);
});

test("resource names retain only a bounded pathname", () => {
	assert.equal(
		sanitizeResourceName("https://api.example.com/accounts/123?password=a"),
		"/accounts/:id",
	);
});
