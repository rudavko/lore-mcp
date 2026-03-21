/** @implements FR-011 — Exported-worker OAuth auth-flow E2E checks. */
import { describe, expect, test } from "bun:test";
import { csrfCookieNameForNonce } from "./auth-shared.pure.js";
import {
	ACCESS_PASSPHRASE,
	PASSKEY_CRED_KEY,
	buildAuthorizePath,
	extractHiddenInputValue,
	workerFetch,
	workerFetchWithCookies,
} from "./auth-wiring-env.test-helpers.js";
import {
	createAuthTestContext,
	runMismatchedAuthorizeCsrfPairFailsFlow,
	runMismatchedEnrollmentCsrfPairFailsFlow,
	requestAuthorizeSession,
	runIpLockoutScenario,
	runPasskeySkipWithoutAlternateFactorFailsFlow,
	runPasskeySkipToTotpOAuthFlow,
	runPassphraseModeDoesNotBypassPasskeyFlow,
	runPassphraseAndTotpOAuthFlow,
	startTotpEnrollmentViaPasskeySkip,
} from "./auth-wiring-flow.test-helpers.js";

describe("auth wiring oauth e2e", () => {
	test("POST /approve handles passkey verification exceptions without 1101", async () => {
		const testContext = await createAuthTestContext();
		await testContext.env.OAUTH_KV.put(
			PASSKEY_CRED_KEY,
			JSON.stringify({
				id: "cred-passkey-throw",
				publicKey:
					"pQECAyYgASFYINBBnATf5b1HEZbNTp0BYe5XaTkKqMu82ZftBIqptvFdIlggtwaxy5-rB1lxeBJSqCSbO_VlMi7gqQTF9CaDoc3KOh4",
				counter: 0,
				transports: ["internal"],
			}),
		);
		const authorize = await requestAuthorizeSession(
			testContext.env,
			testContext.ctx,
			buildAuthorizePath(testContext.client.client_id),
		);
		const approveStep = await workerFetchWithCookies({
			env: testContext.env,
			ctx: testContext.ctx,
			jar: authorize.jar,
			path: "/approve",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					request_nonce: authorize.requestNonce,
					csrf_token: authorize.csrfToken,
					webauthn_response: JSON.stringify({
						id: "cred-passkey-throw",
						rawId: "cred-passkey-throw",
						type: "public-key",
						response: {
							authenticatorData: "AQID",
							clientDataJSON:
								"eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiYmFkLWNoYWxsZW5nZSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3QifQ",
							signature: "AQID",
						},
						clientExtensionResults: {},
					}),
				}).toString(),
			},
		});
		expect(approveStep.response.status).toBe(403);
		expect(await approveStep.response.text()).toContain("Authorization failed");
	});

	test(
		"completes OAuth code + token flow with passphrase + TOTP when both factors are enrolled",
		runPassphraseAndTotpOAuthFlow,
	);

	test(
		"explicit passphrase mode does not bypass passkey when no alternate factor is enrolled",
		runPassphraseModeDoesNotBypassPasskeyFlow,
	);

	test("consumes authorization nonce after first approve attempt (replay blocked)", async () => {
		const testContext = await createAuthTestContext();
		const authorize = await requestAuthorizeSession(
			testContext.env,
			testContext.ctx,
			buildAuthorizePath(testContext.client.client_id),
		);
		const firstApproveStep = await workerFetchWithCookies({
			env: testContext.env,
			ctx: testContext.ctx,
			jar: authorize.jar,
			path: "/approve",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					request_nonce: authorize.requestNonce,
					csrf_token: authorize.csrfToken,
					passphrase: "wrong-passphrase",
				}).toString(),
			},
		});
		expect(firstApproveStep.response.status).toBe(403);
		const replayResponse = await workerFetch(testContext.env, testContext.ctx, "/approve", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				cookie: `${csrfCookieNameForNonce(authorize.requestNonce)}=${authorize.csrfToken}`,
			},
			body: new URLSearchParams({
				request_nonce: authorize.requestNonce,
				csrf_token: authorize.csrfToken,
				passphrase: ACCESS_PASSPHRASE,
			}).toString(),
		});
		expect(replayResponse.status).toBe(400);
		expect(await replayResponse.text()).toContain("Authorization request expired");
	});

	test("locks out client IP after repeated auth failures", runIpLockoutScenario);

	test(
		"mismatched authorize CSRF and request nonce pairs fail with a controlled client error",
		runMismatchedAuthorizeCsrfPairFailsFlow,
	);

	test(
		"supports passkey-skip to TOTP enrollment and completes OAuth",
		runPasskeySkipToTotpOAuthFlow,
	);

	test(
		"passkey enrollment skip without an allowed alternate factor does not redirect",
		runPasskeySkipWithoutAlternateFactorFailsFlow,
	);

	test(
		"mismatched enrollment CSRF and nonce pairs fail with a controlled client error",
		runMismatchedEnrollmentCsrfPairFailsFlow,
	);

	test("invalid TOTP enrollment code invalidates pending enrollment nonce", async () => {
		const testContext = await createAuthTestContext();
		const totpSetup = await startTotpEnrollmentViaPasskeySkip(
			testContext.env,
			testContext.ctx,
			new Map(),
			testContext.client.client_id,
		);
		const enrollNonce = extractHiddenInputValue(totpSetup.totpPageHtml, "enroll_nonce");
		const csrfToken = extractHiddenInputValue(totpSetup.totpPageHtml, "csrf_token");
		const badCodeStep = await workerFetchWithCookies({
			env: testContext.env,
			ctx: testContext.ctx,
			jar: totpSetup.jar,
			path: "/enroll-totp",
			init: {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					enroll_nonce: enrollNonce,
					csrf_token: csrfToken,
					totp_code: "000000",
				}).toString(),
			},
		});
		expect(badCodeStep.response.status).toBe(403);
		expect(await badCodeStep.response.text()).toContain("Invalid verification code");
		const replayEnrollResponse = await workerFetch(testContext.env, testContext.ctx, "/enroll-totp", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				cookie: `${csrfCookieNameForNonce(enrollNonce)}=${csrfToken}`,
			},
			body: new URLSearchParams({
				enroll_nonce: enrollNonce,
				csrf_token: csrfToken,
				totp_code: "123456",
			}).toString(),
		});
		expect(replayEnrollResponse.status).toBe(400);
		expect(await replayEnrollResponse.text()).toContain("Enrollment expired");
	});
});
