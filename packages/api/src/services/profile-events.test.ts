import assert from "node:assert/strict";
import test from "node:test";

import type { GenerateIntroductionResponse } from "../schemas/introduction";
import {
	createSnsProfileEventPublisher,
	ProfileEventPublisherError,
} from "./profile-events";

const response: GenerateIntroductionResponse = {
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
		generatedAt: "2026-07-22T08:30:00Z",
		updatedAt: "2026-07-22T08:30:00Z",
	},
	generated: true,
};

test("publishes only the credential-free event contract", async () => {
	let message = "";
	const publisher = createSnsProfileEventPublisher({
		topicArn: "arn:aws:sns:us-east-2:123456789012:profile-events",
		client: {
			async send(command) {
				message = command.input.Message ?? "";
				return {};
			},
		},
	});

	await publisher.publishIntroductionReady(response);

	assert.deepEqual(JSON.parse(message), {
		eventId: "introduction.ready:1:template-v1:2026-07-22T08:30:00Z",
		eventType: "introduction.ready",
		schemaVersion: 1,
		githubId: 1,
		githubUsername: "octocat",
		generatorVersion: "template-v1",
		generatedAt: "2026-07-22T08:30:00Z",
		generated: true,
	});
	assert.equal(message.includes("token"), false);
});

test("maps SNS failures to a credential-free semantic error", async () => {
	const publisher = createSnsProfileEventPublisher({
		topicArn: "arn:aws:sns:us-east-2:123456789012:profile-events",
		client: {
			async send() {
				throw new Error("request contained credentials");
			},
		},
	});

	await assert.rejects(
		publisher.publishIntroductionReady(response),
		ProfileEventPublisherError,
	);
});
