/** @implements FR-011 — Exported-worker authorize route E2E checks. */
import { describe, expect, test } from "bun:test";
import {
	ACCESS_PASSPHRASE,
	AUTH_MARKER,
	buildAuthorizePath,
	createClientLookupFailingKv,
	createCtx,
	createMemoryKv,
	registerClient,
	seedPasskeyCredential,
	workerFetchWithCookies,
} from "./auth-wiring-env.test-helpers.js";
import { requestAuthorizeSession } from "./auth-wiring-flow.test-helpers.js";

describe("auth wiring authorize e2e", () => {
	test("GET /authorize serves auth UI through exported worker", async () => {
		const env = { OAUTH_KV: createMemoryKv(), ACCESS_PASSPHRASE };
		const ctx = createCtx();
		const client = await registerClient(env, ctx);
		const step = await workerFetchWithCookies({
			env,
			ctx,
			jar: new Map(),
			path: buildAuthorizePath(client.client_id),
		});
		expect(step.response.status).toBe(200);
		expect(step.response.headers.get("content-type") || "").toContain("text/html");
		expect(await step.response.text()).toContain(AUTH_MARKER);
	});

	test("GET /authorize falls back to passphrase UI when stored passkey data is invalid", async () => {
		const env = { OAUTH_KV: createMemoryKv(), ACCESS_PASSPHRASE };
		const ctx = createCtx();
		const client = await registerClient(env, ctx);
		await env.OAUTH_KV.put(
			"ks:passkey:cred",
			JSON.stringify({ id: "", publicKey: "not-a-real-public-key", counter: 0, transports: ["internal"] }),
		);
		const step = await workerFetchWithCookies({
			env,
			ctx,
			jar: new Map(),
			path: buildAuthorizePath(client.client_id),
		});
		const body = await step.response.text();
		expect(step.response.status).toBe(200);
		expect(body).toContain('name="passphrase"');
		expect(body).not.toContain("Authenticating with passkey");
	});

	test("GET /authorize passkey mode CSP allows Claude callback and localhost loopback form actions", async () => {
		const env = { OAUTH_KV: createMemoryKv(), ACCESS_PASSPHRASE };
		const ctx = createCtx();
		const client = await registerClient(env, ctx);
		await seedPasskeyCredential(env);
		const step = await workerFetchWithCookies({
			env,
			ctx,
			jar: new Map(),
			path: buildAuthorizePath(client.client_id),
		});
		const csp = step.response.headers.get("content-security-policy") || "";
		expect(step.response.status).toBe(200);
		expect(csp).toContain("form-action 'self'");
		expect(csp).toContain("https://claude.ai");
		expect(csp).toContain("http://localhost:*");
		expect(csp).toContain("http://127.0.0.1:*");
		expect(csp).toContain("http://[::1]:*");
	});

	test("GET /authorize returns 400 when OAuth client lookup fails", async () => {
		const baseKv = createMemoryKv();
		const env = { OAUTH_KV: createClientLookupFailingKv(baseKv), ACCESS_PASSPHRASE };
		const ctx = createCtx();
		const client = await registerClient(env, ctx);
		await seedPasskeyCredential(env);
		const step = await workerFetchWithCookies({
			env,
			ctx,
			jar: new Map(),
			path: buildAuthorizePath(client.client_id),
		});
		expect(step.response.status).toBe(400);
		expect(await step.response.text()).toContain("Invalid authorization request");
	});

	test("rejects CSRF mismatch without consuming auth request", async () => {
		const env = { OAUTH_KV: createMemoryKv(), ACCESS_PASSPHRASE };
		const ctx = createCtx();
		const client = await registerClient(env, ctx);
		const authorize = await requestAuthorizeSession(env, ctx, buildAuthorizePath(client.client_id));
		const badCsrfStep = await workerFetchWithCookies({
			env,
			ctx,
			jar: authorize.jar,
			path: "/approve",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					request_nonce: authorize.requestNonce,
					csrf_token: "wrong-csrf",
					passphrase: ACCESS_PASSPHRASE,
				}).toString(),
			},
		});
		expect(badCsrfStep.response.status).toBe(400);
		expect(await badCsrfStep.response.text()).toContain("Invalid authorization request");
		const secondTryStep = await workerFetchWithCookies({
			env,
			ctx,
			jar: badCsrfStep.jar,
			path: "/approve",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					request_nonce: authorize.requestNonce,
					csrf_token: authorize.csrfToken,
					passphrase: ACCESS_PASSPHRASE,
				}).toString(),
			},
		});
		expect(secondTryStep.response.status).toBe(200);
		expect(await secondTryStep.response.text()).toContain("Set Up Passkey");
	});
});
