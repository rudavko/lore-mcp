/** @implements FR-001 — Direct wrapper tests for default-handler response/body/cookie behavior. */
import { describe, expect, test } from "bun:test";
import { makeDefaultHandlerFetch } from "./default-handler.orch.1.js";
import {
	createDefaultHandlerDeps,
	createMemoryKv,
	readSetCookies,
	RequestCtor,
} from "./default-handler.test-helpers.js";

function createHandler(registerAuthRoutes) {
	const kv = createMemoryKv();
	const handler = makeDefaultHandlerFetch(
		createDefaultHandlerDeps({
			routeRegistration: {
				registerAuthRoutes,
			},
			authState: {
				failKey: (ip) => `fail:${ip}`,
				lockKey: (ip) => `lock:${ip}`,
				nextFailCount: (raw) => (raw === null ? 1 : Number(raw) + 1),
				isLockoutReached: (count) => count >= 2,
				failWindowTtlSeconds: 60,
				lockoutTtlSeconds: 120,
				passkeyCredentialKey: "passkey",
				challengeTtlSeconds: 300,
				challengeKey: (nonce) => `challenge:${nonce}`,
				kvGet: async (_kv, key) => await kv.get(key),
				kvPut: async (_kv, key, value) => await kv.put(key, value),
				kvPutTtl: async (_kv, key, value) => await kv.put(key, value),
				kvDelete: async (_kv, key) => await kv.delete(key),
			},
			webauthn: {
				buildStoredCredentialData: () => ({}),
				parseStoredCredentialData: () => null,
			},
			otp: {
				base32Encode: () => "BASE32SECRET",
				base32Decode: () => ({ ok: false }),
				validateTotpFormat: () => false,
				counterToBytes: () => [],
				computeTimeCounter: () => 0,
				extractHotpCode: () => "000000",
				buildOtpAuthUri: () => "",
			},
			ui: {
				renderAuthPage: () => "",
				renderEnrollPasskeyPage: () => "",
				renderEnrollTotpPage: () => "",
				renderInstallWorkflowPage: () => "",
			},
			admin: {
				installWorkflowToRepo: async () => ({}),
				normalizeRepoFullName: () => null,
				readAutoUpdatesSetupToken: async () => null,
			},
			platform: {
				nowMs: () => 1_710_000_000_000,
			},
		}),
	);
	return { handler, kv };
}

describe("wiring/default-handler.orch", () => {
	test("returns a 404 text response for unknown routes", async () => {
		const { handler } = createHandler(() => {});
		const response = await handler(new RequestCtor("https://lore.example.com/missing"), {
			OAUTH_KV: createMemoryKv(),
		});

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe("Not found");
	});

	test("applies set-cookie and CSP headers for HTML responses", async () => {
		const { handler } = createHandler((router, deps) => {
			router.get("/html", async () => {
				deps.setCookie("session", "abc 123");
				deps.setCspNonce("nonce-123");
				return deps.htmlResponse("<html>ok</html>");
			});
		});
		const response = await handler(new RequestCtor("https://lore.example.com/html"), {
			OAUTH_KV: createMemoryKv(),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(readSetCookies(response.headers)[0]).toContain("session=abc%20123");
		expect(response.headers.get("content-security-policy")).toContain("'nonce-nonce-123'");
		expect(await response.text()).toBe("<html>ok</html>");
	});

	test("parses JSON, invalid JSON, and form bodies through parseBody", async () => {
		const { handler } = createHandler((router, deps) => {
			router.post("/json", async () => deps.htmlResponse(JSON.stringify(await deps.parseBody())));
			router.post("/form", async () => deps.htmlResponse(JSON.stringify(await deps.parseBody())));
		});

		const jsonResponse = await handler(
			new RequestCtor("https://lore.example.com/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ok: true }),
			}),
			{ OAUTH_KV: createMemoryKv() },
		);
		expect(await jsonResponse.text()).toBe(JSON.stringify({ ok: true }));

		const invalidJsonResponse = await handler(
			new RequestCtor("https://lore.example.com/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{invalid",
			}),
			{ OAUTH_KV: createMemoryKv() },
		);
		expect(await invalidJsonResponse.text()).toBe("{}");

		const formResponse = await handler(
			new RequestCtor("https://lore.example.com/form", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "a=1&b=two",
			}),
			{ OAUTH_KV: createMemoryKv() },
		);
		expect(await formResponse.text()).toBe(JSON.stringify({ a: "1", b: "two" }));
	});

	test("uses cookies, client IP lock tracking, and clearAuthFailures helpers", async () => {
		const { handler, kv } = createHandler((router, deps) => {
			router.get("/cookie", async () => deps.textResponse(deps.getCookie("mode"), 200));
			router.post("/fail", async () => {
				await deps.registerAuthFailure();
				return deps.textResponse("failed", 200);
			});
			router.post("/clear", async () => {
				await deps.clearAuthFailures();
				return deps.textResponse("cleared", 200);
			});
		});

		const cookieResponse = await handler(
			new RequestCtor("https://lore.example.com/cookie", {
				headers: { cookie: "mode=advanced" },
			}),
			{ OAUTH_KV: kv },
		);
		expect(await cookieResponse.text()).toBe("advanced");

		await handler(
			new RequestCtor("https://lore.example.com/fail", {
				method: "POST",
				headers: { "CF-Connecting-IP": "10.0.0.1" },
			}),
			{ OAUTH_KV: kv },
		);
		expect(kv.values.get("fail:10.0.0.1").value).toBe("1");

		await handler(
			new RequestCtor("https://lore.example.com/fail", {
				method: "POST",
				headers: { "CF-Connecting-IP": "10.0.0.1" },
			}),
			{ OAUTH_KV: kv },
		);
		expect(kv.values.get("lock:10.0.0.1").value).toBe("1");

		await handler(
			new RequestCtor("https://lore.example.com/clear", {
				method: "POST",
				headers: { "CF-Connecting-IP": "10.0.0.1" },
			}),
			{ OAUTH_KV: kv },
		);
		expect(kv.values.has("fail:10.0.0.1")).toBe(false);
		expect(kv.values.has("lock:10.0.0.1")).toBe(false);
	});

	test("rejects routes that return response-like objects instead of real Response instances", async () => {
		const { handler } = createHandler((router) => {
			router.get("/bad-shape", async () => ({ status: 204 }));
		});

		await expect(
			handler(new RequestCtor("https://lore.example.com/bad-shape"), {
				OAUTH_KV: createMemoryKv(),
			}),
		).rejects.toThrow("Route handlers must return a Response instance");
	});
});
