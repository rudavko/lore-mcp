/** @implements FR-001 — Regression: passkey verification should not require UV when passphrase is first factor. */
import { expect, test } from "bun:test";
import { registerAuthRoutes } from "../auth.orch.1.js";
import { renderAuthPage } from "../templates/auth-page.pure.js";
import { renderEnrollPasskeyPage } from "../templates/enroll-passkey.pure.js";
import { renderEnrollTotpPage } from "../templates/enroll-totp.pure.js";
import { makeDefaultHandlerFetch } from "./default-handler.orch.1.js";
import {
	createDefaultHandlerDeps,
	createMemoryKv,
	RequestCtor,
} from "./default-handler.test-helpers.js";

test("POST /approve passes requireUserVerification=false to verifyAuthenticationResponse", async () => {
	let capturedVerifyOptions = null;
	const handler = makeDefaultHandlerFetch(
		createDefaultHandlerDeps({
			routeRegistration: {
				registerAuthRoutes,
			},
			ui: {
				renderAuthPage,
				renderEnrollPasskeyPage,
				renderEnrollTotpPage,
			},
			webauthn: {
				verifyAuthenticationResponse: async (opts) => {
					capturedVerifyOptions = opts;
					return { verified: false, authenticationInfo: { newCounter: 0 } };
				},
			},
			authState: {
				kvDelete: async (_kv, _key) => {},
			},
		}),
	);
	const kv = createMemoryKv();
	await kv.put(
		"ks:authreq:req-1",
		JSON.stringify({
			oauthReq: {
				responseType: "code",
				clientId: "client-id",
				redirectUri: "http://localhost/callback",
				scope: [],
			},
			webauthnChallenge: "challenge-1",
		}),
	);
	await kv.put(
		"ks:passkey:cred",
		JSON.stringify({
			id: "cred-id",
			publicKey:
				"pQECAyYgASFYINBBnATf5b1HEZbNTp0BYe5XaTkKqMu82ZftBIqptvFdIlggtwaxy5-rB1lxeBJSqCSbO_VlMi7gqQTF9CaDoc3KOh4",
			counter: 0,
			transports: ["internal"],
		}),
	);
	const body = new URLSearchParams({
		request_nonce: "req-1",
		csrf_token: "csrf-1",
		webauthn_response: JSON.stringify({
			id: "cred-id",
			rawId: "cred-id",
			type: "public-key",
			response: {
				authenticatorData: "AQID",
				clientDataJSON: "AQID",
				signature: "AQID",
			},
		}),
	}).toString();
	const response = await handler(
		new RequestCtor("http://localhost/approve", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				cookie: "ks_csrf=csrf-1",
			},
			body,
		}),
		{
			OAUTH_KV: kv,
			ACCESS_PASSPHRASE: "test-pass",
			OAUTH_PROVIDER: {},
		},
	);
	expect(response.status).toBe(403);
	expect(capturedVerifyOptions).not.toBeNull();
	expect(capturedVerifyOptions.requireUserVerification).toBe(false);
});
