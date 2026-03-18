/** @implements FR-001 — Route-level e2e regression for admin install-workflow with this-sensitive runtime APIs. */
import { expect, test } from "bun:test";
import { registerAdminRoutes } from "../admin.orch.1.js";
import { renderInstallWorkflowPage } from "../templates/install-workflow.pure.js";
import { makeDefaultHandlerFetch } from "./default-handler.orch.1.js";
import { makeInstallWorkflowToRepoRuntime } from "./github-workflow-adapter.efct.js";
import { installWorkflowToRepo } from "../domain/github-workflow.ops.efct.js";
import { normalizeRepoFullName, parseTargetRepo, renderWorkflowYaml } from "../domain/github-workflow.pure.js";
import { AUTO_UPDATES_LINK_PREFIX } from "../domain/auto-updates-link.pure.js";
import { extractHiddenInputValue } from "../test-helpers/html-scrape.test.js";
import {
	createDefaultHandlerDeps,
	createMemoryKv,
	HeadersCtor,
	RequestCtor,
} from "./default-handler.test-helpers.js";
import {
	applySetCookies,
	buildCookieHeader,
} from "../test-helpers/http-cookies.test.js";

function createSensitiveBtoa() {
	return () => {
		throw new Error("injected btoa should not be called");
	};
}

function createGithubFetchApi(targetRepo) {
	const encodedWorkflow = globalThis.btoa(renderWorkflowYaml(targetRepo));
	function responseWith(body, status = 200) {
		const response = {
			status,
			ok: status >= 200 && status < 300,
			json: async () => body,
		};
		return response;
	}
	return async (url) => {
		if (url.endsWith(`/repos/${targetRepo}`)) {
			return responseWith({ default_branch: "main" }, 200);
		}
		if (
			url.endsWith(
				`/repos/${targetRepo}/contents/.github/workflows/upstream-sync.yml?ref=main`,
			)
		) {
			return responseWith(
				{
					sha: "sha-1",
					encoding: "base64",
					content: encodedWorkflow,
				},
				200,
			);
		}
		if (url.endsWith(`/repos/${targetRepo}/contents/.github/workflows/upstream-sync.yml`)) {
			return responseWith(
				{
					commit: {
						sha: "commit-sha-1",
						html_url: `https://github.com/${targetRepo}/commit/commit-sha-1`,
					},
				},
				200,
			);
		}
		return responseWith({ message: `Unhandled URL ${url}` }, 500);
	};
}

function buildHandler(targetRepo) {
	return makeDefaultHandlerFetch(
		createDefaultHandlerDeps({
			routeRegistration: {
				registerAdminRoutes,
			},
			ui: {
				renderInstallWorkflowPage,
			},
			admin: {
				installWorkflowToRepo: makeInstallWorkflowToRepoRuntime({
					installWorkflowToRepo,
					parseTargetRepo,
					renderWorkflowYaml,
					btoa: createSensitiveBtoa(),
					githubFetchApi: createGithubFetchApi(targetRepo),
					jsonStringify: JSON.stringify,
				}),
				normalizeRepoFullName,
				readAutoUpdatesSetupToken: async () => null,
			},
		}),
	);
}

async function handlerFetchWithCookies({ handler, env, jar, path, init }) {
	const headers = new HeadersCtor(init?.headers || undefined);
	const cookieHeader = buildCookieHeader(jar);
	if (cookieHeader.length > 0) {
		headers.set("cookie", cookieHeader);
	}
	const response = await handler(
		new RequestCtor(`http://localhost${path}`, {
			...(init || {}),
			headers,
		}),
		env,
	);
	return { response, jar: applySetCookies(jar, response) };
}

test("admin install-workflow e2e succeeds even when injected btoa is this-sensitive", async () => {
	const targetRepo = "owner/repo";
	const handler = buildHandler(targetRepo);
	const kv = createMemoryKv();
	await kv.put(AUTO_UPDATES_LINK_PREFIX + "setup-token-1", targetRepo);
	const env = {
		OAUTH_KV: kv,
		ACCESS_PASSPHRASE: "test-pass",
	};

	let jar = new Map();
	const installPage = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow?setup_token=setup-token-1",
	});
	jar = installPage.jar;
	expect(installPage.response.status).toBe(200);
	const html = await installPage.response.text();
	const csrfToken = extractHiddenInputValue(html, "csrf_token");
	expect(csrfToken).toBeTruthy();

	const submit = await handlerFetchWithCookies({
		handler,
		env,
		jar,
		path: "/admin/install-workflow",
		init: {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				csrf_token: csrfToken,
				setup_token: "setup-token-1",
				github_pat: "github_pat_test",
			}).toString(),
		},
	});
	expect(submit.response.status).toBe(200);
	const submitHtml = await submit.response.text();
	expect(submitHtml).toContain("Workflow is already up to date.");
	expect(submitHtml).not.toContain("Illegal invocation");
});
