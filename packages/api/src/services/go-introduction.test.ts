import assert from "node:assert/strict";
import test from "node:test";

import {
	createGoIntroductionClient,
	GoIntroductionClientError,
} from "./go-introduction";

const publicIntroduction = {
	githubId: 1,
	githubUsername: "octocat",
	name: "The Octocat",
	avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
	bio: "GitHub mascot",
	company: "GitHub",
	location: "San Francisco",
	blog: "https://github.blog",
	twitterUsername: null,
	publicRepos: 8,
	followers: 100,
	following: 5,
	introduction: "The Octocat（@octocat）是 GitHub 用户。",
	generatorVersion: "template-v1",
	generatedAt: "2026-07-15T10:00:00Z",
	updatedAt: "2026-07-15T10:00:00Z",
};

test("generate calls the private Go endpoint without credentials", async () => {
	let requestedUrl = "";
	let requestedInit: RequestInit | undefined;
	const client = createGoIntroductionClient({
		baseUrl: "http://go-api.github-account-info.local:8080",
		fetchImplementation: async (input, init) => {
			requestedUrl = String(input);
			requestedInit = init;
			return Response.json({
				introduction: publicIntroduction,
				generated: true,
			});
		},
	});

	const result = await client.generate({
		githubUsername: "octocat",
		regenerate: false,
	});

	assert.equal(
		requestedUrl,
		"http://go-api.github-account-info.local:8080/internal/v1/introductions",
	);
	assert.equal(requestedInit?.method, "POST");
	assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
		githubUsername: "octocat",
		regenerate: false,
	});
	assert.equal(new Headers(requestedInit?.headers).has("Authorization"), false);
	assert.equal(result.introduction.bio, "GitHub mascot");
	assert.equal(result.generated, true);
});

test("generate maps a missing stored account to a semantic error", async () => {
	const client = createGoIntroductionClient({
		baseUrl: "http://localhost:8080",
		fetchImplementation: async () =>
			Response.json(
				{
					error: {
						code: "github_account_not_found",
						message: "github account was not found",
					},
				},
				{ status: 404 },
			),
	});

	await assert.rejects(
		client.generate({ githubUsername: "octocat", regenerate: false }),
		(error: unknown) =>
			error instanceof GoIntroductionClientError &&
			error.kind === "not_found" &&
			error.apiCode === "github_account_not_found",
	);
});

test("generate rejects an invalid success payload", async () => {
	const client = createGoIntroductionClient({
		baseUrl: "http://localhost:8080",
		fetchImplementation: async () => Response.json({ generated: true }),
	});

	await assert.rejects(
		client.generate({ githubUsername: "octocat", regenerate: false }),
		(error: unknown) =>
			error instanceof GoIntroductionClientError &&
			error.kind === "invalid_response",
	);
});

test("generate turns request timeouts into unavailable errors", async () => {
	const client = createGoIntroductionClient({
		baseUrl: "http://localhost:8080",
		fetchImplementation: async () => {
			throw new DOMException("timed out", "TimeoutError");
		},
	});

	await assert.rejects(
		client.generate({ githubUsername: "octocat", regenerate: false }),
		(error: unknown) =>
			error instanceof GoIntroductionClientError &&
			error.kind === "unavailable",
	);
});
