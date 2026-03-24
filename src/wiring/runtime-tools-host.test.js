/** @implements FR-001 — Verify tool host adapter resolves build metadata and env-backed ports. */
import { describe, expect, test } from "bun:test";
import { createToolsHostDeps, resolveBuildHash } from "./runtime-tools-host.orch.4.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

const std = createGlobalTestStd(globalThis);

describe("wiring/runtime-tools-host", () => {
	test("resolveBuildHash prefers explicit build hash then CI commit hashes", () => {
		expect(resolveBuildHash({ BUILD_HASH: "build-1" })).toBe("build-1");
		expect(resolveBuildHash({ WORKERS_CI_COMMIT_SHA: "workers-sha" })).toBe("workers-sha");
		expect(resolveBuildHash({ CF_PAGES_COMMIT_SHA: "pages-sha" })).toBe("pages-sha");
		expect(resolveBuildHash({})).toBe("unknown");
	});

	test("builds normalized host deps from env", async () => {
		const issued = [];
		const host = createToolsHostDeps(
			{
				DB: { label: "db" },
				BUILD_HASH: "build-42",
				EMBEDDING_MAX_RETRIES: "9",
				TARGET_REPO: "rudavko/lore-mcp-d1",
				ACCESS_PASSPHRASE: "secret",
				VECTORIZE_INDEX: {
					deleteByIds: async (ids) => ids.length,
				},
			},
			{
				std,
				normalizeRepoFullName: (value) => value.trim().toLowerCase(),
				issueAutoUpdatesSetupToken: (...args) => {
					issued.push(args);
					return "token";
				},
				cryptoLike: globalThis.crypto,
				textEncoderCtor: TextEncoder,
				textDecoderCtor: TextDecoder,
				uint8ArrayCtor: Uint8Array,
				jsonStringify: JSON.stringify,
				jsonParse: JSON.parse,
			},
		);

		expect(host.db).toEqual({ label: "db" });
		expect(host.buildHash).toBe("build-42");
		expect(host.embeddingMaxRetries).toBe(9);
		expect(await host.resolveAutoUpdatesTargetRepo()).toBe("rudavko/lore-mcp-d1");
		expect(await host.vectorizeDeleteByIds(["a", "b"])).toBe(2);
		expect(host.issueAutoUpdatesSetupToken("repo", 123)).toBe("token");
		expect(issued).toHaveLength(1);
	});
});
