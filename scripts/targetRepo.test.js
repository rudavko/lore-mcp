/** @implements NFR-001 — Verify deploy-time target repo resolution helpers. */
import { describe, expect, test } from "bun:test";

import {
	parseGitHubRepoFromOrigin,
	resolveTargetRepo,
} from "./targetRepo.js";

describe("scripts/targetRepo", () => {
	test("parses HTTPS GitHub origins", () => {
		expect(parseGitHubRepoFromOrigin("https://github.com/octocat/hello-world.git")).toBe(
			"octocat/hello-world",
		);
	});

	test("parses SSH GitHub origins", () => {
		expect(parseGitHubRepoFromOrigin("git@github.com:octocat/hello-world.git")).toBe(
			"octocat/hello-world",
		);
	});

	test("prefers explicit args over env", () => {
		expect(
			resolveTargetRepo({
				explicitArg: "arg-owner/arg-repo",
				envTargetRepo: "env-owner/env-repo",
			}),
		).toBe("arg-owner/arg-repo");
	});

	test("uses env override when present", () => {
		expect(resolveTargetRepo({ envTargetRepo: "env-owner/env-repo" })).toBe(
			"env-owner/env-repo",
		);
	});
});
