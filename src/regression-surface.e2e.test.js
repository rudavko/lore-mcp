/** @implements FR-001 — Black-box e2e regression contracts for auth/admin surfaces. */
import { describe, expect, test } from "bun:test";
import { AUTO_UPDATES_LINK_PREFIX } from "./domain/auto-updates-link.pure.js";
import {
	buildAuthorizePath,
	createCtx,
	createMemoryKv,
	extractHiddenInputValue,
	workerFetch,
	workerFetchWithCookies,
} from "./auth-wiring-env.test-helpers.js";
const ResponseCtor = globalThis.Response;
const ACCESS_PASSPHRASE = "test-pass";
function jsonResponse(body, status = 200) {
	return new ResponseCtor(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}
async function seedAutoUpdateLink(env, token = "setup-token-1", targetRepo = "owner/repo") {
	await env.OAUTH_KV.put(AUTO_UPDATES_LINK_PREFIX + token, targetRepo);
	return token;
}
describe("regression surface e2e", () => {
	test("unknown OAuth client_id fails safely with 4xx (never throw/500)", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		let response = null;
		let thrown = null;
		try {
			response = await workerFetch(env, ctx, buildAuthorizePath("missing-client-id"));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeNull();
		expect(response !== null).toBe(true);
		if (response === null) {
			return;
		}
		expect(response.status >= 400 && response.status < 500).toBe(true);
	});
	test("admin install-workflow URL requires a valid one-time setup token", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		const response = await workerFetch(env, ctx, "/admin/install-workflow");
		expect(response.status).toBe(401);
		expect(await response.text()).toContain("Invalid or expired setup link");
	});
	test("admin install-workflow renders install UI when setup token is valid", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		const setupToken = await seedAutoUpdateLink(env);
		const response = await workerFetchWithCookies({
			env,
			ctx,
			jar: new Map(),
			path: `/admin/install-workflow?setup_token=${setupToken}`,
		});
		expect(response.response.status).toBe(200);
		expect(await response.response.text()).toContain("Install Workflow");
	});
	test("admin POST install-workflow rejects CSRF mismatch", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		const setupToken = await seedAutoUpdateLink(env);
		let jar = new Map();
		const installPage = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: `/admin/install-workflow?setup_token=${setupToken}`,
		});
		jar = installPage.jar;
		const html = await installPage.response.text();
		const csrfToken = extractHiddenInputValue(html, "csrf_token");
		expect(csrfToken.length > 0).toBe(true);
		const submit = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: "/admin/install-workflow",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					csrf_token: "wrong-csrf",
					setup_token: setupToken,
					github_pat: "ghp_test",
				}).toString(),
			},
		});
		expect(submit.response.status).toBe(400);
		expect(await submit.response.text()).toContain("Invalid request");
	});
	test("admin POST install-workflow rejects invalid repo format from the setup token before install call", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		const setupToken = await seedAutoUpdateLink(env, "setup-token-1", "invalid-repo-format");
		let jar = new Map();
		const installPage = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: `/admin/install-workflow?setup_token=${setupToken}`,
		});
		jar = installPage.jar;
		const html = await installPage.response.text();
		const csrfToken = extractHiddenInputValue(html, "csrf_token");
		const submit = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: "/admin/install-workflow",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					csrf_token: csrfToken,
					setup_token: setupToken,
					github_pat: "ghp_test",
				}).toString(),
			},
		});
		expect(submit.response.status).toBe(200);
		expect(await submit.response.text()).toContain(
			"Invalid repository format. Expected: owner/repo",
		);
	});
	test("admin install-workflow succeeds through exported worker and consumes the setup token", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
		};
		const ctx = createCtx();
		const setupToken = await seedAutoUpdateLink(env, "setup-token-success", "owner/repo");
		let jar = new Map();
		const installPage = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: `/admin/install-workflow?setup_token=${setupToken}`,
		});
		jar = installPage.jar;
		const html = await installPage.response.text();
		const csrfToken = extractHiddenInputValue(html, "csrf_token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input, init) => {
			const url = typeof input === "string" ? input : input.url;
			if (!url.startsWith("https://api.github.com/")) {
				return await originalFetch(input, init);
			}
			if (url.endsWith("/repos/owner/repo")) {
				return jsonResponse({ default_branch: "main" }, 200);
			}
			if (
				url.endsWith("/repos/owner/repo/contents/.github/workflows/upstream-sync.yml?ref=main")
			) {
				return jsonResponse({ message: "Not Found" }, 404);
			}
			if (url.endsWith("/repos/owner/repo/contents/.github/workflows/upstream-sync.yml")) {
				return jsonResponse(
					{
						commit: {
							sha: "commit-sha-1",
							html_url: "https://github.com/owner/repo/commit/commit-sha-1",
						},
					},
					200,
				);
			}
			return jsonResponse({ message: `Unhandled URL ${url}` }, 500);
		};
		const submit = await workerFetchWithCookies({
			env,
			ctx,
			jar,
			path: "/admin/install-workflow",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					csrf_token: csrfToken,
					setup_token: setupToken,
					github_pat: "ghp_test_token",
				}).toString(),
			},
		}).then(
			(result) => {
				globalThis.fetch = originalFetch;
				return result;
			},
			(error) => {
				globalThis.fetch = originalFetch;
				throw error;
			},
		);
		expect(submit.response.status).toBe(200);
		const text = await submit.response.text();
		expect(text).toContain("Workflow created successfully.");
		expect(text).toContain("View commit");
		const replay = await workerFetch(
			env,
			ctx,
			`/admin/install-workflow?setup_token=${setupToken}`,
		);
		expect(replay.status).toBe(401);
		expect(await replay.text()).toContain("Invalid or expired setup link");
	});
});
