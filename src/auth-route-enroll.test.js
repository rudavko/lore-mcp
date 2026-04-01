/** @implements FR-018 — Verify enrollment route handler behavior. */
import { describe, expect, test } from "bun:test";
import { csrfCookieNameForNonce } from "./auth-shared.pure.js";
import {
	AUTH_ACTION_ENROLL_TOTP,
	AUTH_ACTION_REGISTER_PASSKEY,
	AUTH_ACTION_SKIP_PASSKEY,
	AUTH_FLOW_VERSION,
	AUTH_STAGE_ENROLL_PASSKEY,
	AUTH_STAGE_ENROLL_TOTP,
	buildPendingTotpRecord,
	buildStoredChallengeRecord,
	createPasskeyEnrollmentFlowState,
	createTotpEnrollmentFlowState,
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

function buildPasskeyEnrollmentState(overrides = {}) {
	return {
		version: AUTH_FLOW_VERSION,
		stage: AUTH_STAGE_ENROLL_PASSKEY,
		oauthReq: buildOauthReq(),
		allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY],
		requiredNextAction: AUTH_ACTION_REGISTER_PASSKEY,
		alternateFactorSatisfied: false,
		allowTotpEnrollment: false,
		...overrides,
	};
}

function buildPendingTotpFlowState() {
	return createTotpEnrollmentFlowState({
		oauthReq: buildOauthReq(),
		sourceStage: AUTH_STAGE_ENROLL_PASSKEY,
		sourceAction: AUTH_ACTION_ENROLL_TOTP,
	});
}

function buildPendingPasskeyState() {
	return createPasskeyEnrollmentFlowState({
		oauthReq: buildOauthReq(),
		alternateFactorSatisfied: false,
		allowTotpEnrollment: true,
	});
}

async function seedPendingTotpRecord(harness) {
	await harness.deps.kvPut(
		"ks:totp:pending:nonce-1",
		JSON.stringify(
			buildPendingTotpRecord(
				"ABCDEFGHIJKLMNOP",
				buildPendingTotpFlowState(),
				"csrf-1",
				buildPendingPasskeyState(),
			),
		),
	);
}

describe("auth-route-enroll.orch", () => {
	test("handleEnrollPasskey validates CSRF, challenge shape, and registration stage", async () => {
		const invalid = createAuthRouteHarness();
		invalid.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "{}",
		});
		expect(await invalid.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		expired.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "{}",
		});
		expect(await expired.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Enrollment expired. Please start over.",
			kind: "text",
		});

		const invalidState = createAuthRouteHarness();
		invalidState.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		invalidState.challengeMap.set("nonce-1", {
			type: "registration",
			challenge: "reg-challenge",
			oauthReq: { clientId: "test-client" },
		});
		invalidState.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "{}",
		});
		expect(await invalidState.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Invalid enrollment state. Please start over.",
			kind: "text",
		});
	});

	test("handleEnrollPasskey completes registration when the challenge is valid", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		harness.challengeMap.set(
			"nonce-1",
			buildStoredChallengeRecord(
				"reg-challenge",
				createPasskeyEnrollmentFlowState({
					oauthReq: buildOauthReq(),
					alternateFactorSatisfied: false,
					allowTotpEnrollment: true,
				}),
				"registration",
				"csrf-1",
			),
		);
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: JSON.stringify({ id: "cred-1" }),
		});
		expect(await harness.createHandlers().handleEnrollPasskey()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});
	});

	test("handleEnrollPasskey rejects malformed registration payloads with a controlled client error", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		harness.challengeMap.set(
			"nonce-1",
			buildStoredChallengeRecord(
				"reg-challenge",
				createPasskeyEnrollmentFlowState({
					oauthReq: buildOauthReq(),
					alternateFactorSatisfied: false,
					allowTotpEnrollment: true,
				}),
				"registration",
				"csrf-1",
			),
		);
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "",
		});
		expect(await harness.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Invalid registration data",
			kind: "text",
		});
	});

	test("handleCompletePasskeySkip and handleEnrollTotpRedirect require valid POST nonce/csrf", async () => {
		const invalid = createAuthRouteHarness();
		expect(await invalid.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});

		const valid = createAuthRouteHarness();
		valid.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		valid.setBody({ enroll_nonce: "nonce-1", csrf_token: "csrf-1" });
		valid.challengeMap.set(
			"nonce-1",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY, AUTH_ACTION_SKIP_PASSKEY],
					alternateFactorSatisfied: true,
				}),
				"registration",
				"csrf-1",
			),
		);
		expect(await valid.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});

		const redirect = createAuthRouteHarness();
		redirect.cookies.set(csrfCookieNameForNonce("nonce-2"), "csrf-1");
		redirect.setBody({ enroll_nonce: "nonce-2", csrf_token: "csrf-1" });
		redirect.challengeMap.set(
			"nonce-2",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY, AUTH_ACTION_ENROLL_TOTP],
					allowTotpEnrollment: true,
				}),
				"registration",
				"csrf-1",
			),
		);
		const enrollResponse = await redirect.createHandlers().handleEnrollTotpRedirect();
		expect(enrollResponse.status).toBe(200);
		expect(enrollResponse.body).toContain("ABCDEFGHIJKLMNOP");
		expect(redirect.kvWrites.map((entry) => entry.key)).toContain("ks:totp:pending:token-1");
	});

	test("skip and TOTP redirect reject invalid enrollment state transitions", async () => {
		const skipHarness = createAuthRouteHarness();
		skipHarness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		skipHarness.setBody({ enroll_nonce: "nonce-1", csrf_token: "csrf-1" });
		skipHarness.challengeMap.set(
			"nonce-1",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY],
				}),
				"registration",
				"csrf-1",
			),
		);
		expect(await skipHarness.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 400,
			body: "Invalid enrollment state. Please start over.",
			kind: "text",
		});

		const redirectHarness = createAuthRouteHarness();
		redirectHarness.cookies.set(csrfCookieNameForNonce("nonce-2"), "csrf-1");
		redirectHarness.setBody({ enroll_nonce: "nonce-2", csrf_token: "csrf-1" });
		redirectHarness.challengeMap.set(
			"nonce-2",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY],
				}),
				"registration",
				"csrf-1",
			),
		);
		expect(await redirectHarness.createHandlers().handleEnrollTotpRedirect()).toEqual({
			status: 400,
			body: "Invalid enrollment state. Please start over.",
			kind: "text",
		});

		const nonRegistrationHarness = createAuthRouteHarness();
		nonRegistrationHarness.cookies.set(csrfCookieNameForNonce("nonce-3"), "csrf-1");
		nonRegistrationHarness.setBody({ enroll_nonce: "nonce-3", csrf_token: "csrf-1" });
		nonRegistrationHarness.challengeMap.set(
			"nonce-3",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY, AUTH_ACTION_SKIP_PASSKEY],
					alternateFactorSatisfied: true,
				}),
				"authentication",
				"csrf-1",
			),
		);
		expect(await nonRegistrationHarness.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 400,
			body: "Invalid enrollment state. Please start over.",
			kind: "text",
		});
	});

	test("handleEnrollTotpRedirect rejects auth sessions that already have TOTP enrolled", async () => {
		const redirect = createAuthRouteHarness();
		redirect.cookies.set(csrfCookieNameForNonce("nonce-2"), "csrf-1");
		redirect.setBody({ enroll_nonce: "nonce-2", csrf_token: "csrf-1" });
		redirect.challengeMap.set(
			"nonce-2",
			buildStoredChallengeRecord(
				"c",
				buildPasskeyEnrollmentState({
					allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY, AUTH_ACTION_ENROLL_TOTP],
					allowTotpEnrollment: true,
				}),
				"registration",
				"csrf-1",
			),
		);
		await redirect.deps.kvPut("ks:totp:secret", "existing-secret");
		expect(await redirect.createHandlers().handleEnrollTotpRedirect()).toEqual({
			status: 400,
			body: "Authenticator code is already enrolled. Retry authorization.",
			kind: "text",
		});
		expect(redirect.kvWrites.map((entry) => entry.key)).not.toContain("ks:totp:pending:token-1");
	});

	test("handleEnrollTotp rejects invalid requests and missing pending state", async () => {
		const invalid = createAuthRouteHarness();
		invalid.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await invalid.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		expired.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await expired.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Enrollment expired. Please start over.",
			kind: "text",
		});

		const mismatchedCsrf = createAuthRouteHarness();
		mismatchedCsrf.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-cookie");
		mismatchedCsrf.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-body",
			totp_code: "123456",
		});
		expect(await mismatchedCsrf.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});
	});

	test("handleEnrollTotp stores the enrolled secret and completes authorization", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		await seedPendingTotpRecord(harness);
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await harness.createHandlers().handleEnrollTotp()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});
		expect(harness.kvValues.get("ks:totp:secret")).toBe("ABCDEFGHIJKLMNOP");
	});

	test("handleEnrollTotp rejects invalid pending state and overwriting an existing enrolled secret", async () => {
		const invalidState = createAuthRouteHarness();
		invalidState.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		await invalidState.deps.kvPut("ks:totp:pending:nonce-1", JSON.stringify({ secret: "ABCDEFGHIJKLMNOP" }));
		invalidState.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await invalidState.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Invalid enrollment state",
			kind: "text",
		});

		const harness = createAuthRouteHarness();
		harness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		await harness.deps.kvPut("ks:totp:secret", "existing-secret");
		await seedPendingTotpRecord(harness);
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await harness.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Authenticator code is already enrolled. Retry authorization.",
			kind: "text",
		});
		expect(harness.kvValues.get("ks:totp:secret")).toBe("existing-secret");
	});
});
