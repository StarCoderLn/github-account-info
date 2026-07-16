import assert from "node:assert/strict";
import test from "node:test";

import {
	cloudflarePreviewKey,
	isPreviewKey,
	previewKeyFromCommitSha,
} from "./index.mjs";

const COMMIT_SHA = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";

test("normalizes the same full commit SHA into one bounded preview key", () => {
	assert.equal(previewKeyFromCommitSha(COMMIT_SHA), "preview-abcdef012345");
	assert.equal(isPreviewKey("preview-abcdef012345"), true);
});

test("rejects ambiguous or shortened commit identifiers", () => {
	assert.throws(() => previewKeyFromCommitSha("abcdef0"), /40 hexadecimal/);
	assert.throws(
		() => previewKeyFromCommitSha("z".repeat(40)),
		/40 hexadecimal/,
	);
});

test("derives a key only for Cloudflare preview branches", () => {
	assert.equal(
		cloudflarePreviewKey({
			CF_PAGES: "1",
			CF_PAGES_BRANCH: "feature/profile",
			CF_PAGES_COMMIT_SHA: COMMIT_SHA,
		}),
		"preview-abcdef012345",
	);
	assert.equal(
		cloudflarePreviewKey({
			CF_PAGES: "1",
			CF_PAGES_BRANCH: "master",
			CF_PAGES_COMMIT_SHA: COMMIT_SHA,
		}),
		"",
	);
	assert.equal(cloudflarePreviewKey({}), "");
});

test("validates an explicitly injected key", () => {
	assert.equal(
		cloudflarePreviewKey({ VITE_PREVIEW_KEY: "preview-abcdef012345" }),
		"preview-abcdef012345",
	);
	assert.throws(
		() => cloudflarePreviewKey({ VITE_PREVIEW_KEY: "pr-123" }),
		/VITE_PREVIEW_KEY/,
	);
});
