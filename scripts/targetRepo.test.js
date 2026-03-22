/** @implements NFR-001 — Verify deploy-time target repo resolution helpers. */
import { describe, expect, test } from "bun:test";

import { resolveTargetRepo } from "./targetRepo.js";

describe("scripts/targetRepo", () => {
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

	test("throws when no explicit target repo is configured", () => {
		expect(() => resolveTargetRepo({})).toThrow(
			"Missing TARGET_REPO. Provide the downstream deploy repo explicitly via argv or TARGET_REPO env. Never infer it from the source repo Git remote.",
		);
	});
});
