/** @implements FR-018 — Verify approve route handler behavior. */
import { describe, expect, test } from "bun:test";
import { csrfCookieNameForNonce } from "./auth-shared.pure.js";
import {
	AUTH_ACTION_APPROVE_PASSKEY,
	AUTH_ACTION_APPROVE_PASSPHRASE,
	AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
	AUTH_FLOW_VERSION,
	AUTH_STAGE_AWAITING_PASSKEY,
	AUTH_STAGE_AWAITING_PASSPHRASE,
	AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
} from "./auth-flow-state.pure.js";
import { createAuthRouteHarness } from "./auth-route-handlers.test-helpers.js";

function buildOauthReq() {
	return {
		responseType: "code",
		clientId: "test-client",
		redirectUri: "https://client.example/callback",
		scope: ["read"],
	};
}

function buildStoredRequest({ stage, requiredNextAction, webauthnChallenge, csrfToken = "csrf-1" }) {
	const record = {
		csrfToken,
		flowState: {
			version: AUTH_FLOW_VERSION,
			stage,
			oauthReq: buildOauthReq(),
			allowedMethods: [requiredNextAction],
			requiredNextAction,
		},
	};
	if (webauthnChallenge) {
		record.webauthnChallenge = webauthnChallenge;
	}
	return JSON.stringify(record);
}

describe("auth-route-approve.orch", () => {
	test("handleApprove rejects invalid CSRF, expired requests, and malformed stored state", async () => {
		const invalidCsrf = createAuthRouteHarness();
		invalidCsrf.setBody({ request_nonce: "req-1", csrf_token: "body-csrf" });
		expect(await invalidCsrf.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set(csrfCookieNameForNonce("req-1"), "csrf-1");
		expired.setBody({ request_nonce: "req-1", csrf_token: "csrf-1" });
		expect(await expired.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Authorization request expired. Retry authorization.",
			kind: "text",
		});

		const invalidState = createAuthRouteHarness();
		invalidState.cookies.set(csrfCookieNameForNonce("req-1"), "csrf-1");
		await invalidState.deps.kvPut("ks:authreq:req-1", JSON.stringify({ oauthReq: { clientId: "test-client" } }));
		invalidState.setBody({
			request_nonce: "req-1",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await invalidState.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
			kind: "text",
		});

		const missingOauthReq = createAuthRouteHarness();
		missingOauthReq.cookies.set(csrfCookieNameForNonce("req-2"), "csrf-1");
		await missingOauthReq.deps.kvPut(
			"ks:authreq:req-2",
			JSON.stringify({
				csrfToken: "csrf-1",
				flowState: {
					version: AUTH_FLOW_VERSION,
					stage: AUTH_STAGE_AWAITING_PASSPHRASE,
					allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE],
					requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
				},
			}),
		);
		missingOauthReq.setBody({
			request_nonce: "req-2",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await missingOauthReq.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
			kind: "text",
		});

		const missingStage = createAuthRouteHarness();
		missingStage.cookies.set(csrfCookieNameForNonce("req-3"), "csrf-1");
		await missingStage.deps.kvPut(
			"ks:authreq:req-3",
			JSON.stringify({
				csrfToken: "csrf-1",
				flowState: {
					version: AUTH_FLOW_VERSION,
					oauthReq: buildOauthReq(),
					allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE],
					requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
				},
			}),
		);
		missingStage.setBody({
			request_nonce: "req-3",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await missingStage.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
			kind: "text",
		});

		const invalidAction = createAuthRouteHarness();
		invalidAction.cookies.set(csrfCookieNameForNonce("req-4"), "csrf-1");
		await invalidAction.deps.kvPut(
			"ks:authreq:req-4",
			JSON.stringify({
				csrfToken: "csrf-1",
				flowState: {
					version: AUTH_FLOW_VERSION,
					stage: AUTH_STAGE_AWAITING_PASSPHRASE,
					oauthReq: buildOauthReq(),
					allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
					requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
				},
			}),
		);
		invalidAction.setBody({
			request_nonce: "req-4",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await invalidAction.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
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
		invalidPassphrase.cookies.set(csrfCookieNameForNonce("req-1"), "csrf-1");
		await invalidPassphrase.deps.kvPut(
			"ks:authreq:req-1",
			buildStoredRequest({
				stage: AUTH_STAGE_AWAITING_PASSPHRASE,
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
			}),
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

	test("handleApprove completes passkey flow and rejects passphrase downgrade attempts", async () => {
		const passkeyHarness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			verifyAuthentication: async () => ({ verified: true, newCounter: 9 }),
		});
		passkeyHarness.cookies.set(csrfCookieNameForNonce("req-1"), "csrf-1");
		await passkeyHarness.deps.kvPut(
			"ks:authreq:req-1",
			buildStoredRequest({
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
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

		let authFailureCount = 0;
		const downgradeHarness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			createAuthenticationOptions: async () => ({ challenge: "usable" }),
			registerAuthFailure: async () => {
				authFailureCount += 1;
			},
		});
		downgradeHarness.cookies.set(csrfCookieNameForNonce("req-2"), "csrf-1");
		await downgradeHarness.deps.kvPut(
			"ks:authreq:req-2",
			buildStoredRequest({
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
				webauthnChallenge: "auth-challenge",
			}),
		);
		downgradeHarness.setBody({
			request_nonce: "req-2",
			csrf_token: "csrf-1",
			passphrase: "test-pass",
		});
		expect(await downgradeHarness.createHandlers().handleApprove()).toEqual({
			status: 403,
			body: "Authorization failed",
			kind: "text",
		});
		expect(authFailureCount).toBe(0);

		const invalidPasskeyState = createAuthRouteHarness();
		invalidPasskeyState.cookies.set(csrfCookieNameForNonce("req-3"), "csrf-1");
		await invalidPasskeyState.deps.kvPut(
			"ks:authreq:req-3",
			buildStoredRequest({
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
			}),
		);
		invalidPasskeyState.setBody({
			request_nonce: "req-3",
			csrf_token: "csrf-1",
			webauthn_response: JSON.stringify({ id: "cred-1" }),
		});
		expect(await invalidPasskeyState.createHandlers().handleApprove()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
			kind: "text",
		});
	});

	test("handleApprove requires TOTP when the stored state says passphrase + TOTP", async () => {
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
		harness.cookies.set(csrfCookieNameForNonce("req-1"), "csrf-1");
		await harness.deps.kvPut(
			"ks:authreq:req-1",
			buildStoredRequest({
				stage: AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
			}),
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
