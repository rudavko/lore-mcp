/** @implements NFR-001 — Verify GitHub workflow install orchestration handles create, update, and error paths. */
import { describe, expect, test } from "bun:test";
import { installWorkflowToRepo } from "./github-workflow.ops.efct.js";

describe("domain/github-workflow.ops.efct", () => {
	test("returns parse errors before making GitHub calls", async () => {
		let fetchCalls = 0;
		const result = await installWorkflowToRepo("token", "bad repo", {
			parseTargetRepo: () => ({ error: "Invalid repo format" }),
			githubFetch: async () => {
				fetchCalls += 1;
				return { ok: true, body: {} };
			},
		});

		expect(result).toEqual({ ok: false, error: "Invalid repo format" });
		expect(fetchCalls).toBe(0);
	});

	test("formats repository metadata errors from GitHub payloads", async () => {
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async () => ({
				ok: false,
				status: 403,
				body: {
					message: "Forbidden",
					documentation_url: "https://docs.github.com",
				},
			}),
			readJsonSafe: async (response) => response.body,
		});

		expect(result).toEqual({
			ok: false,
			error: "GitHub API 403: Forbidden (https://docs.github.com)",
		});
	});

	test("creates a new workflow file when none exists", async () => {
		const fetchCalls = [];
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (path === "/repos/owner/repo") {
					return { ok: true, status: 200, body: { default_branch: "main" } };
				}
				if (
					path ===
					"/repos/owner/repo/contents/.github/workflows/upstream-sync.yml?ref=main"
				) {
					return { ok: false, status: 404, body: {} };
				}
				return {
					ok: true,
					status: 201,
					body: { commit: { sha: "commit-1", html_url: "https://github.com/commit-1" } },
				};
			},
			readJsonSafe: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "created",
			commitSha: "commit-1",
			commitUrl: "https://github.com/commit-1",
		});
		expect(fetchCalls[2]).toEqual({
			path: "/repos/owner/repo/contents/.github/workflows/upstream-sync.yml",
			token: "token",
			init: {
				method: "PUT",
				body: JSON.stringify({
					message: "chore: enable upstream sync",
					content: "b64:yaml:owner/repo",
					branch: "main",
				}),
			},
		});
	});

	test("updates an existing workflow file when GitHub returns an existing sha", async () => {
		const fetchCalls = [];
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (path === "/repos/owner/repo") {
					return { ok: true, status: 200, body: { default_branch: "main" } };
				}
				if (
					path ===
					"/repos/owner/repo/contents/.github/workflows/upstream-sync.yml?ref=main"
				) {
					return { ok: true, status: 200, body: { sha: "existing-sha" } };
				}
				return {
					ok: true,
					status: 200,
					body: { commit: { sha: "commit-2", html_url: "https://github.com/commit-2" } },
				};
			},
			readJsonSafe: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "updated",
			commitSha: "commit-2",
			commitUrl: "https://github.com/commit-2",
		});
		expect(fetchCalls[2].init.body).toContain('"sha":"existing-sha"');
	});

	test("returns unchanged without writing when the installed workflow already matches", async () => {
		const fetchCalls = [];
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (path === "/repos/owner/repo") {
					return { ok: true, status: 200, body: { default_branch: "main" } };
				}
				return {
					ok: true,
					status: 200,
					body: {
						sha: "existing-sha",
						encoding: "base64",
						content: "b64:yaml:owner/repo",
					},
				};
			},
			readJsonSafe: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "unchanged",
		});
		expect(fetchCalls).toHaveLength(2);
	});
});
