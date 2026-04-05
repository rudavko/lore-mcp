/** @implements NFR-001 — Verify GitHub workflow install orchestration handles create, update, and error paths. */
import { describe, expect, test } from "bun:test";
import { discoverDeployRepo, installWorkflowToRepo } from "./github-workflow.ops.efct.js";

describe("domain/github-workflow.ops.efct", () => {
	function createDeployRepoResponse(targetRepo) {
		return {
			["/repos/" + targetRepo]: { ok: true, status: 200, body: { default_branch: "main" } },
			["/repos/" + targetRepo + "/contents/package.json?ref=main"]: {
				ok: true,
				status: 200,
				body: {
					encoding: "base64",
					content: btoa(
						JSON.stringify({
							name: "lore-mcp-cloudflare",
							dependencies: { "lore-mcp": "github:rudavko/lore-mcp#v0.2.0" },
						}),
					),
				},
			},
			["/repos/" + targetRepo + "/contents/wrangler.jsonc?ref=main"]: {
				ok: true,
				status: 200,
				body: { encoding: "base64", content: btoa("{\"name\":\"lore-mcp\"}") },
			},
			["/repos/" + targetRepo + "/branches/main"]: {
				ok: true,
				status: 200,
				body: { name: "main" },
			},
			["/repos/" + targetRepo + "/compare/buildsha...main"]: {
				ok: true,
				status: 200,
				body: { status: "identical" },
			},
			["/repos/" + targetRepo + "/contents/.github/workflows/upstream-sync.yml?ref=main"]: {
				ok: false,
				status: 404,
				body: {},
			},
		};
	}

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
			parseTargetRepo: (targetRepo) => {
				const [owner, repo] = targetRepo.split("/");
				return { error: null, owner, repo };
			},
			githubFetch: async () => ({
				ok: false,
				status: 403,
				body: {
					message: "Forbidden",
					documentation_url: "https://docs.github.com",
				},
			}),
			getBody: async (response) => response.body,
		});

		expect(result).toEqual({
			ok: false,
			error: "GitHub API 403: Forbidden (https://docs.github.com)",
		});
	});

	test("creates a new workflow file when none exists", async () => {
		const fetchCalls = [];
		const responses = createDeployRepoResponse("owner/repo");
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (responses[path]) {
					return responses[path];
				}
				return {
					ok: true,
					status: 201,
					body: { commit: { sha: "commit-1", html_url: "https://github.com/commit-1" } },
				};
			},
			getBody: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			atob: globalThis.atob,
			encodeUriComponent: encodeURIComponent,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "created",
			commitSha: "commit-1",
			commitUrl: "https://github.com/commit-1",
		});
		const upsertCall = fetchCalls.find(
			(call) => call.path === "/repos/owner/repo/contents/.github/workflows/upstream-sync.yml",
		);
		expect(upsertCall).toEqual({
			path: "/repos/owner/repo/contents/.github/workflows/upstream-sync.yml",
			token: "token",
			init: {
				method: "PUT",
				body: JSON.stringify({
					message: "chore: bump lore-mcp dependency",
					content: "b64:yaml:owner/repo",
					branch: "main",
				}),
			},
		});
	});

	test("updates an existing workflow file when GitHub returns an existing sha", async () => {
		const fetchCalls = [];
		const responses = createDeployRepoResponse("owner/repo");
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (
					path ===
					"/repos/owner/repo/contents/.github/workflows/upstream-sync.yml?ref=main"
				) {
					return {
						ok: true,
						status: 200,
						body: {
							sha: "existing-sha",
							encoding: "base64",
							content: btoa("# Managed by lore-mcp auto-updates\nprevious"),
						},
					};
				}
				if (responses[path]) {
					return responses[path];
				}
				return {
					ok: true,
					status: 200,
					body: { commit: { sha: "commit-2", html_url: "https://github.com/commit-2" } },
				};
			},
			getBody: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			atob: globalThis.atob,
			encodeUriComponent: encodeURIComponent,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "updated",
			commitSha: "commit-2",
			commitUrl: "https://github.com/commit-2",
		});
		const upsertCall = fetchCalls.find(
			(call) => call.path === "/repos/owner/repo/contents/.github/workflows/upstream-sync.yml",
		);
		expect(upsertCall.init.body).toContain('"sha":"existing-sha"');
	});

	test("returns unchanged without writing when the installed workflow already matches", async () => {
		const fetchCalls = [];
		const responses = createDeployRepoResponse("owner/repo");
		const result = await installWorkflowToRepo("token", "owner/repo", {
			parseTargetRepo: () => ({ error: null, owner: "owner", repo: "repo" }),
			githubFetch: async (path, token, init) => {
				fetchCalls.push({ path, token, init });
				if (
					path ===
					"/repos/owner/repo/contents/.github/workflows/upstream-sync.yml?ref=main"
				) {
					return {
						ok: true,
						status: 200,
						body: {
							sha: "existing-sha",
							encoding: "base64",
							content: "b64:yaml:owner/repo",
						},
					};
				}
				if (responses[path]) {
					return responses[path];
				}
				return { ok: false, status: 404, body: {} };
			},
			getBody: async (response) => response.body,
			renderWorkflowYaml: (repo) => `yaml:${repo}`,
			btoa: (value) => `b64:${value}`,
			atob: globalThis.atob,
			encodeUriComponent: encodeURIComponent,
			jsonStringify: JSON.stringify,
		});

		expect(result).toEqual({
			ok: true,
			action: "unchanged",
		});
		expect(fetchCalls.length).toBeGreaterThan(2);
	});

	test("discovers the only writable repository visible to a single-repo PAT and verifies the build ref", async () => {
		const responses = createDeployRepoResponse("owner/deploy-repo");
		const result = await discoverDeployRepo("token", { mode: "workers_build_ref", branch: "main", commitSha: "buildsha" }, {
			parseTargetRepo: (targetRepo) => {
				const [owner, repo] = targetRepo.split("/");
				return { error: null, owner, repo };
			},
			githubFetch: async (path) => {
				if (path === "/user/repos?per_page=100&sort=updated") {
					return {
						ok: true,
						status: 200,
						body: [{ full_name: "owner/deploy-repo", permissions: { push: true } }],
					};
				}
				return responses[path];
			},
			getBody: async (response) => response.body,
			atob: globalThis.atob,
			encodeUriComponent: encodeURIComponent,
		});
		expect(result).toEqual({ ok: true, targetRepo: "owner/deploy-repo" });
	});
});
