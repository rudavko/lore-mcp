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
	const payloadText = deps.jsonStringify({ v: 1, repo: targetRepo, exp: expiresAtMs });
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
			clearAuthFailures: async () => {},
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
		const harness = createHarness({
			nowMs,
			readAutoUpdatesSetupToken: async (token) =>
				token === setupToken ? { targetRepo: "owner/repo", expiresAtMs: 61_000 } : null,
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

		const usedKey =
			"ks:auto_updates_used:sig:" + setupToken.slice(setupToken.indexOf(".") + 1);
		expect(await harness.kv.get(usedKey)).toBe("1");

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
				token === setupToken ? { targetRepo: "owner/repo", expiresAtMs: 61_000 } : null,
			kvPutImpl: async (key) => {
				if (key.startsWith("ks:auto_updates_used:")) {
					return Promise.reject("kv unavailable");
				}
			},
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
		expect(rendered.result.warning).toContain("could not be invalidated");
	});

	test("converts unexpected post errors into a 500 text response instead of throwing", async () => {
		const nowMs = () => 1_000;
		const setupToken = await issueSetupToken("owner/repo", 61_000, makeTokenDeps(nowMs));
		const harness = createHarness({
				nowMs,
				readAutoUpdatesSetupToken: async (token) =>
					token === setupToken ? { targetRepo: "owner/repo", expiresAtMs: 61_000 } : null,
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
});
