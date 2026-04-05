/** @implements NFR-001 — Admin install-workflow success-path and cleanup regression tests. */
import { describe, expect, test } from "bun:test";
import { registerAdminRoutes } from "./admin.orch.1.js";
const Uint8ArrayCtor = globalThis.Uint8Array;

function normalizeExpirationOptions(rawOptions) {
	if (typeof rawOptions === "number" && rawOptions > 0) {
		return { expirationTtl: rawOptions };
	}
	return rawOptions || null;
}

function createMemoryKv(options = {}) {
	const values = new Map();
	const putImpl = options.putImpl;
	const getImpl = options.getImpl;
	const deleteImpl = options.deleteImpl;
	return {
		get: async (key, rawOptions) => {
			if (typeof getImpl === "function") {
				return await getImpl(key, rawOptions, values);
			}
			return values.has(key) ? values.get(key).value : null;
		},
		put: async (key, value, rawOptions) => {
			if (typeof putImpl === "function") {
				return await putImpl(key, value, rawOptions, values);
			}
			const normalized = normalizeExpirationOptions(rawOptions);
			const ttlSeconds =
				typeof normalized?.expirationTtl === "number" && normalized.expirationTtl > 0
					? normalized.expirationTtl
					: null;
			const expiresAtMs = ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000;
			values.set(key, { value, expiresAtMs });
		},
		delete: async (key) => {
			if (typeof deleteImpl === "function") {
				return await deleteImpl(key, values);
			}
			values.delete(key);
		},
		values,
	};
}

function bytesToBinaryString(bytes) {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return binary;
}

function toBase64Url(base64) {
	return base64.replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function makeTokenDeps(nowMs = () => 1_000) {
	return {
		accessPassphrase: "test-passphrase",
		cryptoLike: crypto,
		textEncoderCtor: TextEncoder,
		textDecoderCtor: TextDecoder,
		uint8ArrayCtor: Uint8ArrayCtor,
		arrayFrom: Array.from,
		stringFromCharCode: String.fromCharCode,
		numberIsFinite: Number.isFinite,
		btoa,
		atob,
		jsonStringify: JSON.stringify,
		jsonParse: JSON.parse,
		nowMs,
	};
}

async function issueSetupToken(targetRepo, expiresAtMs, deps) {
	const payloadText = deps.jsonStringify({
		v: 2,
		repo: targetRepo,
		exp: expiresAtMs,
		ctx:
			targetRepo.length > 0
				? { mode: "exact_repo", repo: targetRepo }
				: { mode: "workers_build_ref", branch: "main", commitSha: "buildsha" },
	});
	const payloadBase64Url = toBase64Url(
		deps.btoa(bytesToBinaryString(new deps.textEncoderCtor().encode(payloadText))),
	);
	const key = await deps.cryptoLike.subtle.importKey(
		"raw",
		new deps.textEncoderCtor().encode(deps.accessPassphrase),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await deps.cryptoLike.subtle.sign(
		"HMAC",
		key,
		new deps.textEncoderCtor().encode(payloadBase64Url),
	);
	const signatureBase64Url = toBase64Url(
		deps.btoa(bytesToBinaryString(new deps.uint8ArrayCtor(signature))),
	);
	return payloadBase64Url + "." + signatureBase64Url;
}

function createHarness(options = {}) {
	const cookies = new Map();
	let currentBody = {};
	let currentQuery = {};
	const responses = [];
	const kv = createMemoryKv({ putImpl: options.kvPutImpl });
	const routes = { get: new Map(), post: new Map() };
	const kvGetMethod = kv.get.bind(kv);
	const kvPutMethod = kv.put.bind(kv);
	const kvDeleteMethod = kv.delete.bind(kv);
	const kvGet = (key) => kvGetMethod(key);
	const kvPut = (key, value, ttlSeconds) => kvPutMethod(key, value, ttlSeconds);
	const kvDelete = (key) => kvDeleteMethod(key);
	registerAdminRoutes(
		{
			get: (path, handler) => {
				routes.get.set(path, handler);
			},
			post: (path, handler) => {
				routes.post.set(path, handler);
			},
		},
		{
			kvGet,
			kvPut,
			kvDelete,
			setCookie: (name, value) => {
				cookies.set(name, value);
			},
			getCookie: (name) => cookies.get(name) || "",
			randomToken: () => "csrf-token-1",
			safeStringEqual: async (left, right) => left === right,
			bodyString: (value) => (typeof value === "string" ? value : ""),
			isIpLocked: async () => false,
			clearAuthFailures: options.clearAuthFailures || (async () => {}),
			discoverDeployRepo:
				options.discoverDeployRepo ||
				(async () => ({
					ok: false,
					error: "Automatic repository discovery is unavailable",
				})),
			installWorkflowToRepo:
				options.installWorkflowToRepo ||
				(async () => ({ ok: true, action: "unchanged" })),
			normalizeRepoFullName: (value) => (typeof value === "string" ? value.trim() : ""),
			renderInstallWorkflowPage: (params) => JSON.stringify(params),
			readAutoUpdatesSetupToken: async (token) => {
				if (typeof options.readAutoUpdatesSetupToken === "function") {
					return await options.readAutoUpdatesSetupToken(token);
				}
				return null;
			},
			isAutoUpdatesSetupTokenConsumed:
				options.isAutoUpdatesSetupTokenConsumed || (async () => false),
			claimAutoUpdatesSetupToken:
				options.claimAutoUpdatesSetupToken ||
				(async () => ({ ok: true, claimId: "claim-1" })),
			releaseAutoUpdatesSetupTokenClaim:
				options.releaseAutoUpdatesSetupTokenClaim || (async () => {}),
			completeAutoUpdatesSetupTokenClaim:
				options.completeAutoUpdatesSetupTokenClaim || (async () => ({ ok: true })),
			recordAutoUpdatesInstallState:
				options.recordAutoUpdatesInstallState || (async () => {}),
			parseBody: async () => currentBody,
			queryParam: (name) => currentQuery[name] || "",
			htmlResponse: (body, status = 200) => {
				const response = { status, body };
				responses.push(response);
				return response;
			},
			textResponse: (body, status = 200) => {
				const response = { status, body };
				responses.push(response);
				return response;
			},
			nowMs: options.nowMs || (() => 1_000),
		},
	);
	return {
		routes,
		kv,
		cookies,
		responses,
		setBody: (body) => {
			currentBody = body;
		},
		setQuery: (query) => {
			currentQuery = query;
		},
	};
}

describe("admin.efct", () => {
	test("consumes a signed setup token after a successful unchanged install", async () => {
		const nowMs = () => 1_000;
		const setupToken = await issueSetupToken("owner/repo", 61_000, makeTokenDeps(nowMs));
		let consumed = false;
		const harness = createHarness({
			nowMs,
			readAutoUpdatesSetupToken: async (token) =>
				token === setupToken
					? {
							targetRepo: "owner/repo",
							expiresAtMs: 61_000,
							installContext: { mode: "exact_repo", repo: "owner/repo" },
						}
					: null,
			isAutoUpdatesSetupTokenConsumed: async () => consumed,
			completeAutoUpdatesSetupTokenClaim: async () => {
				consumed = true;
				return { ok: true };
			},
		});

		harness.setQuery({ setup_token: setupToken });
		const getResponse = await harness.routes.get.get("/install-workflow")();
		expect(getResponse.status).toBe(200);

		harness.setBody({
			csrf_token: "csrf-token-1",
			setup_token: setupToken,
			github_pat: "github_pat_test",
		});
		const postResponse = await harness.routes.post.get("/install-workflow")();
		expect(postResponse.status).toBe(200);
		const rendered = JSON.parse(postResponse.body);
		expect(rendered.result).toEqual({ ok: true, action: "unchanged" });
		expect(rendered.setupToken).toBe("");

		harness.setQuery({ setup_token: setupToken });
		const repeatGet = await harness.routes.get.get("/install-workflow")();
		expect(repeatGet.status).toBe(401);
		expect(repeatGet.body).toContain("Invalid or expired setup link");
	});

	test("returns success with warning when setup-link invalidation write fails", async () => {
		const nowMs = () => 1_000;
		const setupToken = await issueSetupToken("owner/repo", 61_000, makeTokenDeps(nowMs));
		const harness = createHarness({
			nowMs,
			readAutoUpdatesSetupToken: async (token) =>
				token === setupToken
					? {
							targetRepo: "owner/repo",
							expiresAtMs: 61_000,
							installContext: { mode: "exact_repo", repo: "owner/repo" },
						}
					: null,
			completeAutoUpdatesSetupTokenClaim: async () => ({ ok: false }),
		});

		harness.setQuery({ setup_token: setupToken });
		await harness.routes.get.get("/install-workflow")();

		harness.setBody({
			csrf_token: "csrf-token-1",
			setup_token: setupToken,
			github_pat: "github_pat_test",
		});
		const postResponse = await harness.routes.post.get("/install-workflow")();
		expect(postResponse.status).toBe(200);
		const rendered = JSON.parse(postResponse.body);
		expect(rendered.result.ok).toBe(true);
		expect(rendered.result.action).toBe("unchanged");
		expect(rendered.result.warning).toContain("could not be marked complete");
	});

	test("converts unexpected post errors into a 500 text response instead of throwing", async () => {
		const nowMs = () => 1_000;
		const setupToken = await issueSetupToken("owner/repo", 61_000, makeTokenDeps(nowMs));
		const harness = createHarness({
				nowMs,
				readAutoUpdatesSetupToken: async (token) =>
					token === setupToken
						? {
								targetRepo: "owner/repo",
								expiresAtMs: 61_000,
								installContext: { mode: "exact_repo", repo: "owner/repo" },
							}
						: null,
				installWorkflowToRepo: async () => Promise.reject("boom"),
			});

		harness.setQuery({ setup_token: setupToken });
		await harness.routes.get.get("/install-workflow")();

		harness.setBody({
			csrf_token: "csrf-token-1",
			setup_token: setupToken,
			github_pat: "github_pat_test",
		});
		const postResponse = await harness.routes.post.get("/install-workflow")();
		expect(postResponse.status).toBe(500);
		expect(postResponse.body).toContain(
			"Unexpected admin install error: installWorkflowToRepo: boom",
		);
	});

	test("does not clear auth failures when the setup token is invalid", async () => {
		let clearCalls = 0;
		const harness = createHarness({
			clearAuthFailures: async () => {
				clearCalls += 1;
			},
		});
		harness.cookies.set("ks_admin_csrf", "csrf-token-1");

		harness.setBody({
			csrf_token: "csrf-token-1",
			setup_token: "invalid.token",
			github_pat: "github_pat_test",
		});
		const postResponse = await harness.routes.post.get("/install-workflow")();

		expect(postResponse.status).toBe(401);
		expect(postResponse.body).toContain("Invalid or expired setup link");
		expect(clearCalls).toBe(0);
	});

	test("discovers the target repo during POST when the setup token has no preset repo", async () => {
		const nowMs = () => 1_000;
		const setupToken = await issueSetupToken("", 61_000, makeTokenDeps(nowMs));
		const installCalls = [];
		const harness = createHarness({
			nowMs,
			readAutoUpdatesSetupToken: async (token) =>
				token === setupToken
					? {
							targetRepo: "",
							expiresAtMs: 61_000,
							installContext: {
								mode: "workers_build_ref",
								branch: "main",
								commitSha: "buildsha",
							},
						}
					: null,
			discoverDeployRepo: async () => ({ ok: true, targetRepo: "owner/discovered-repo" }),
			installWorkflowToRepo: async (_token, targetRepo) => {
				installCalls.push(targetRepo);
				return { ok: true, action: "created" };
			},
		});

		harness.setQuery({ setup_token: setupToken });
		const getResponse = await harness.routes.get.get("/install-workflow")();
		expect(getResponse.status).toBe(200);

		harness.setBody({
			csrf_token: "csrf-token-1",
			setup_token: setupToken,
			github_pat: "github_pat_test",
		});
		const postResponse = await harness.routes.post.get("/install-workflow")();
		expect(postResponse.status).toBe(200);
		const rendered = JSON.parse(postResponse.body);
		expect(installCalls).toEqual(["owner/discovered-repo"]);
		expect(rendered.defaultRepo).toBe("owner/discovered-repo");
		expect(rendered.result).toEqual({ ok: true, action: "created" });
	});
});
