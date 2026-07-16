import assert from "node:assert/strict";
import test from "node:test";

import type { Context } from "../context";
import type { GenerateIntroductionResponse } from "../schemas/introduction";
import {
	type GoIntroductionClient,
	GoIntroductionClientError,
} from "../services/go-introduction";
import { createIntroductionRouter } from "./introduction-router";

const generatedResponse: GenerateIntroductionResponse = {
	introduction: {
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
	},
	generated: true,
};

test("generate forwards the validated username and regeneration flag", async () => {
	let receivedInput:
		| Parameters<GoIntroductionClient["generate"]>[0]
		| undefined;
	const caller = createCaller({
		async generate(input) {
			receivedInput = input;
			return generatedResponse;
		},
	});

	const result = await caller.generate({
		githubUsername: "octocat",
		regenerate: true,
	});

	assert.deepEqual(receivedInput, {
		githubUsername: "octocat",
		regenerate: true,
	});
	assert.equal(result.generated, true);
});

for (const [kind, expectedCode] of [
	["invalid_request", "BAD_REQUEST"],
	["not_found", "NOT_FOUND"],
	["unavailable", "SERVICE_UNAVAILABLE"],
	["invalid_response", "BAD_GATEWAY"],
] as const) {
	test(`generate maps ${kind} to ${expectedCode}`, async () => {
		const caller = createCaller({
			async generate() {
				throw new GoIntroductionClientError(kind, "semantic failure");
			},
		});

		await assert.rejects(
			caller.generate({ githubUsername: "octocat", regenerate: false }),
			(error: unknown) =>
				hasTrpcCode(error, expectedCode) &&
				error instanceof Error &&
				error.message === "semantic failure",
		);
	});
}

test("generate hides unexpected internal errors", async () => {
	const caller = createCaller({
		async generate() {
			throw new Error("connection contained a secret");
		},
	});

	await assert.rejects(
		caller.generate({ githubUsername: "octocat", regenerate: false }),
		(error: unknown) =>
			hasTrpcCode(error, "INTERNAL_SERVER_ERROR") &&
			error instanceof Error &&
			error.message === "生成个人介绍失败",
	);
});

test("generate is forbidden when the management API is disabled", async () => {
	let called = false;
	const caller = createCaller(
		{
			async generate() {
				called = true;
				return generatedResponse;
			},
		},
		false,
	);

	await assert.rejects(
		caller.generate({ githubUsername: "octocat", regenerate: false }),
		(error: unknown) =>
			hasTrpcCode(error, "FORBIDDEN") &&
			error instanceof Error &&
			error.message === "生产环境未开放管理操作",
	);
	assert.equal(called, false);
});

function createCaller(
	client: GoIntroductionClient,
	managementApiEnabled = true,
) {
	return createIntroductionRouter(client).createCaller({
		auth: null,
		session: null,
		db: null,
		managementApiEnabled,
	} as unknown as Context);
}

function hasTrpcCode(error: unknown, expectedCode: string) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === expectedCode
	);
}
