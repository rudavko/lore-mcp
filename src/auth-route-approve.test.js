/** @implements FR-018 — Verify approve route handler behavior. */
import { describe, expect, test } from "bun:test";
import { createAuthRouteHarness } from "./auth-route-handlers.test-helpers.js";

describe("auth-route-approve.orch", () => {
	test("handleApprove rejects invalid CSRF and expired requests", async () => {
		const invalidCsrf = createAuthRouteHarness();
		invalidCsrf.setBody({ request_nonce: "req-1", csrf_token: "body-csrf" });
		expect(await invalidCsrf.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set("ks_csrf", "csrf-1");
		expired.setBody({ request_nonce: "req-1", csrf_token: "csrf-1" });
		expect(await expired.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Authorization request expired. Retry authorization.",
			kind: "text",
		});
	});

	test("handleApprove enforces lockout and rejects invalid passphrases", async () => {
		const locked = createAuthRouteHarness({ isIpLocked: async () => true });
		expect(await locked.createHandlers().handleApprove()).toEqual({
			status: 429,
			body: "Too many failed attempts. Please try again later.",
			kind: "text",
		});

		const invalidPassphrase = createAuthRouteHarness();
		invalidPassphrase.cookies.set("ks_csrf", "csrf-1");
		await invalidPassphrase.deps.kvPut(
			"ks:authreq:req-1",
			JSON.stringify({ oauthReq: { clientId: "test-client", scope: ["read"] } }),
		);
		invalidPassphrase.setBody({
			request_nonce: "req-1",
			csrf_token: "csrf-1",
			passphrase: "wrong-pass",
		});
		expect(await invalidPassphrase.createHandlers().handleApprove()).toEqual({
			status: 403,
			body: "Authorization failed",
			kind: "text",
		});
	});

	test("handleApprove completes passkey and fallback passphrase flows", async () => {
		const passkeyHarness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			verifyAuthentication: async () => ({ verified: true, newCounter: 9 }),
		});
		passkeyHarness.cookies.set("ks_csrf", "csrf-1");
		await passkeyHarness.deps.kvPut(
			"ks:authreq:req-1",
			JSON.stringify({
				oauthReq: { clientId: "test-client", scope: ["read"] },
				webauthnChallenge: "auth-challenge",
			}),
		);
		passkeyHarness.setBody({
			request_nonce: "req-1",
			csrf_token: "csrf-1",
			webauthn_response: JSON.stringify({ id: "cred-1" }),
		});
		expect(await passkeyHarness.createHandlers().handleApprove()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});

		const fallbackHarness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			createAuthenticationOptions: async () => ({ challenge: "usable" }),
		});
		fallbackHarness.deps.kvGet = async (key) => {
			if (key === "ks:totp:secret") {
				return null;
			}
			return fallbackHarness.kvValues.has(key) ? fallbackHarness.kvValues.get(key) : null;
		};
		fallbackHarness.cookies.set("ks_csrf", "csrf-1");
		await fallbackHarness.deps.kvPut(
			"ks:authreq:req-2",
			JSON.stringify({
				oauthReq: { clientId: "test-client", scope: ["read"] },
				fallbackRequested: true,
			}),
		);
		fallbackHarness.setBody({
			request_nonce: "req-2",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await fallbackHarness.createHandlers().handleApprove()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});
	});

	test("handleApprove can pivot from valid TOTP to passkey enrollment when passkey is unusable", async () => {
		const harness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			createAuthenticationOptions: async () => ({}),
			startPasskeyEnrollment: async () => ({
				status: 200,
				body: "start-passkey-enroll",
				kind: "html",
			}),
		});
		harness.deps.kvGet = async (key) => {
			if (key === "ks:totp:secret") {
				return "totp-secret";
			}
			return harness.kvValues.has(key) ? harness.kvValues.get(key) : null;
		};
		harness.cookies.set("ks_csrf", "csrf-1");
		await harness.deps.kvPut(
			"ks:authreq:req-1",
			JSON.stringify({ oauthReq: { clientId: "test-client", scope: ["read"] } }),
		);
		harness.setBody({
			request_nonce: "req-1",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
			totp_code: "123456",
		});
		expect(await harness.createHandlers().handleApprove()).toEqual({
			status: 200,
			body: "start-passkey-enroll",
			kind: "html",
		});
	});
});
