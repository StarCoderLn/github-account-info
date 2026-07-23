import assert from "node:assert/strict";
import test from "node:test";

import { createHandler } from "./lambda";

const profile = {
	githubId: 1,
	githubUsername: "octocat",
	name: "The Octocat",
	avatarUrl: "https://github.com/images/error/octocat_happy.gif",
	bio: null,
	company: null,
	location: null,
	blog: null,
	twitterUsername: null,
	publicRepos: 8,
	followers: 10,
	following: 2,
	introduction: "A generated profile.",
	generatorVersion: "template-v1",
	generatedAt: "2026-07-22T08:30:00Z",
	updatedAt: "2026-07-22T08:30:00Z",
};

const validRecord = {
	messageId: "valid",
	body: JSON.stringify({
		eventId: "introduction.ready:1:template-v1:2026-07-22T08:30:00Z",
		eventType: "introduction.ready",
		schemaVersion: 1,
		githubId: 1,
		githubUsername: "octocat",
		generatorVersion: "template-v1",
		generatedAt: "2026-07-22T08:30:00Z",
		generated: true,
	}),
};

test("reports only invalid SQS records as partial batch failures", async () => {
	const requestedUrls: string[] = [];
	const handler = createHandler({
		publicApiUrl: "https://api.example.com",
		fetcher: async (input) => {
			requestedUrls.push(input.toString());
			return Response.json(profile);
		},
	});
	const result = await handler({
		Records: [
			validRecord,
			{
				messageId: "invalid",
				body: JSON.stringify({ schemaVersion: 999 }),
			},
		],
	});

	assert.deepEqual(result, {
		batchItemFailures: [{ itemIdentifier: "invalid" }],
	});
	assert.deepEqual(requestedUrls, [
		"https://api.example.com/api/v1/github-users/octocat/introduction",
	]);
});

test("retries a valid event when the public profile is unavailable", async () => {
	const handler = createHandler({
		publicApiUrl: "https://api.example.com",
		fetcher: async () => new Response(null, { status: 503 }),
	});

	assert.deepEqual(await handler({ Records: [validRecord] }), {
		batchItemFailures: [{ itemIdentifier: "valid" }],
	});
});

test("retries a valid event when the published profile does not match", async () => {
	const handler = createHandler({
		publicApiUrl: "https://api.example.com",
		fetcher: async () =>
			Response.json({ ...profile, generatorVersion: "unexpected-version" }),
	});

	assert.deepEqual(await handler({ Records: [validRecord] }), {
		batchItemFailures: [{ itemIdentifier: "valid" }],
	});
});
