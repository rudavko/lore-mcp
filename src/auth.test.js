/** @implements FR-018 — Verify auth flow-state transitions remain stable under refactors. */
import { describe, expect, test } from "bun:test";
import {
	AUTH_ACTION_APPROVE_PASSKEY,
	AUTH_ACTION_APPROVE_PASSPHRASE,
	AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
	AUTH_ACTION_ENROLL_TOTP,
	AUTH_ACTION_REGISTER_PASSKEY,
	AUTH_ACTION_SKIP_PASSKEY,
	AUTH_ACTION_VERIFY_TOTP_ENROLLMENT,
	AUTH_STAGE_AWAITING_PASSKEY,
	AUTH_STAGE_AWAITING_PASSPHRASE,
	AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
	AUTH_STAGE_ENROLL_PASSKEY,
	AUTH_STAGE_ENROLL_TOTP,
	buildPendingTotpRecord,
	buildStoredAuthRequestRecord,
	buildStoredChallengeRecord,
	createAuthorizeFlowState,
	createPasskeyEnrollmentFlowState,
	createTotpEnrollmentFlowState,
	canSkipPasskeyEnrollment,
	canStartTotpEnrollment,
	parsePendingTotpRecord,
	parseStoredAuthRequestRecord,
	parseStoredChallengeRecord,
	resolvePassphraseApprovalAction,
} from "./auth-flow-state.pure.js";

function classifyStoredOutcome(flowState) {
	const passphraseAction = resolvePassphraseApprovalAction(flowState);
	if (flowState.requiredNextAction === AUTH_ACTION_APPROVE_PASSKEY) {
		return "passkey_auth";
	}
	if (passphraseAction === AUTH_ACTION_APPROVE_PASSPHRASE_TOTP) {
		return "passphrase_plus_totp";
	}
	if (passphraseAction === AUTH_ACTION_APPROVE_PASSPHRASE) {
		return "passkey_enrollment";
	}
	return "denial";
}

function classifyCanonicalOutcome({ oauthReq, passkeyUsable, totpEnrolled, passphraseModeRequested }) {
	const authorizeState = createAuthorizeFlowState({
		oauthReq,
		passkeyUsable,
		totpEnrolled,
		passphraseModeRequested,
	});
	if (authorizeState.requiredNextAction === AUTH_ACTION_APPROVE_PASSKEY) {
		if (passphraseModeRequested && resolvePassphraseApprovalAction(authorizeState)) {
			return "passphrase_plus_totp";
		}
		return "passkey_auth";
	}
	if (authorizeState.requiredNextAction === AUTH_ACTION_APPROVE_PASSPHRASE_TOTP) {
		return passkeyUsable ? "passphrase_plus_totp" : "passkey_enrollment";
	}
	if (authorizeState.requiredNextAction === AUTH_ACTION_APPROVE_PASSPHRASE) {
		const enrollState = createPasskeyEnrollmentFlowState({
			oauthReq,
			alternateFactorSatisfied: false,
			allowTotpEnrollment: true,
		});
		if (canStartTotpEnrollment(enrollState)) {
			return "totp_enrollment";
		}
		return "passkey_enrollment";
	}
	return "denial";
}

function buildOauthReq() {
	return {
		responseType: "code",
		clientId: "client-1",
		redirectUri: "https://client.example/callback",
		scope: ["read"],
	};
}

function buildInvalidPasskeyEnrollmentState(oauthReq) {
	return {
		version: 1,
		stage: AUTH_STAGE_ENROLL_PASSKEY,
		oauthReq,
		allowedMethods: [AUTH_ACTION_SKIP_PASSKEY],
		requiredNextAction: AUTH_ACTION_REGISTER_PASSKEY,
		alternateFactorSatisfied: false,
		allowTotpEnrollment: false,
	};
}

function buildValidPasskeyEnrollmentState(oauthReq) {
	return createPasskeyEnrollmentFlowState({
		oauthReq,
		alternateFactorSatisfied: false,
		allowTotpEnrollment: true,
	});
}

function buildInvalidPendingTotpState(oauthReq) {
	return {
		version: 1,
		stage: AUTH_STAGE_ENROLL_TOTP,
		oauthReq,
		allowedMethods: [AUTH_ACTION_ENROLL_TOTP],
		requiredNextAction: AUTH_ACTION_ENROLL_TOTP,
	};
}

function buildAuthorizeStateForChallenge(oauthReq) {
	return createAuthorizeFlowState({
		oauthReq,
		passkeyUsable: true,
		totpEnrolled: false,
		passphraseModeRequested: false,
	});
}

function buildPendingTotpParentState(oauthReq) {
	return createPasskeyEnrollmentFlowState({
		oauthReq,
		alternateFactorSatisfied: false,
		allowTotpEnrollment: true,
	});
}

function buildValidTotpPendingState(oauthReq) {
	return createTotpEnrollmentFlowState({
		oauthReq,
		sourceStage: AUTH_STAGE_ENROLL_PASSKEY,
		sourceAction: AUTH_ACTION_ENROLL_TOTP,
	});
}

function parseChallengeRecordForTest(flowState) {
	return parseStoredChallengeRecord(
		buildStoredChallengeRecord("challenge-1", flowState, "registration", "csrf-1"),
	);
}

function parsePendingTotpForTest(secret, flowState, parentState) {
	return parsePendingTotpRecord(
		buildPendingTotpRecord(secret, flowState, "csrf-1", parentState),
	);
}

describe("auth-flow-state.pure", () => {
	test("derives the expected authorize action for the capability matrix", () => {
		const oauthReq = buildOauthReq();
		const cases = [
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: false,
				stage: AUTH_STAGE_AWAITING_PASSPHRASE,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: false,
				stage: AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE_TOTP],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: false,
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: false,
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY, AUTH_ACTION_APPROVE_PASSPHRASE_TOTP],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
			},
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: true,
				stage: AUTH_STAGE_AWAITING_PASSPHRASE,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: true,
				stage: AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSPHRASE_TOTP],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: true,
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: true,
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY, AUTH_ACTION_APPROVE_PASSPHRASE_TOTP],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
			},
		];
		for (const testCase of cases) {
			const flowState = createAuthorizeFlowState({
				oauthReq,
				passkeyUsable: testCase.passkeyUsable,
				totpEnrolled: testCase.totpEnrolled,
				passphraseModeRequested: testCase.passphraseModeRequested,
			});
			expect(flowState.stage).toBe(testCase.stage);
			expect(flowState.allowedMethods).toEqual(testCase.allowedMethods);
			expect(flowState.requiredNextAction).toBe(testCase.requiredNextAction);
		}
	});

	test("maps the capability matrix to the expected stored auth outcome class", () => {
		const oauthReq = buildOauthReq();
		const cases = [
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: false,
				outcomeClass: "passkey_enrollment",
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: false,
				outcomeClass: "passphrase_plus_totp",
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: false,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: false,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: true,
				outcomeClass: "passkey_enrollment",
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: true,
				outcomeClass: "passphrase_plus_totp",
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: true,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: true,
				outcomeClass: "passkey_auth",
			},
		];
		for (const testCase of cases) {
			const authorizeState = createAuthorizeFlowState({
				oauthReq,
				passkeyUsable: testCase.passkeyUsable,
				totpEnrolled: testCase.totpEnrolled,
				passphraseModeRequested: testCase.passphraseModeRequested,
			});
			expect(classifyStoredOutcome(authorizeState)).toBe(testCase.outcomeClass);
		}
	});

	test("maps the capability matrix to the canonical downstream outcome set", () => {
		const oauthReq = buildOauthReq();
		const cases = [
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: false,
				outcomeClass: "totp_enrollment",
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: false,
				outcomeClass: "passkey_enrollment",
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: false,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: false,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: false,
				totpEnrolled: false,
				passphraseModeRequested: true,
				outcomeClass: "totp_enrollment",
			},
			{
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested: true,
				outcomeClass: "passkey_enrollment",
			},
			{
				passkeyUsable: true,
				totpEnrolled: false,
				passphraseModeRequested: true,
				outcomeClass: "passkey_auth",
			},
			{
				passkeyUsable: true,
				totpEnrolled: true,
				passphraseModeRequested: true,
				outcomeClass: "passphrase_plus_totp",
			},
		];
		for (const testCase of cases) {
			expect(classifyCanonicalOutcome({ oauthReq, ...testCase })).toBe(testCase.outcomeClass);
		}
	});

	test("makes the skip-enabled passkey-enrollment branch explicit in the capability matrix", () => {
		const oauthReq = buildOauthReq();
		for (const passphraseModeRequested of [false, true]) {
			const authorizeState = createAuthorizeFlowState({
				oauthReq,
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested,
			});
			expect(classifyCanonicalOutcome({
				oauthReq,
				passkeyUsable: false,
				totpEnrolled: true,
				passphraseModeRequested,
			})).toBe("passkey_enrollment");
			const downstreamEnrollState = createPasskeyEnrollmentFlowState({
				oauthReq,
				alternateFactorSatisfied: true,
				allowTotpEnrollment: false,
			});
			expect(resolvePassphraseApprovalAction(authorizeState)).toBe(
				AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
			);
			expect(canSkipPasskeyEnrollment(downstreamEnrollState)).toBe(true);
			expect(canStartTotpEnrollment(downstreamEnrollState)).toBe(false);
		}
	});

	test("does not let passphrase mode change stored auth state when a passkey is usable", () => {
		const flowState = createAuthorizeFlowState({
			oauthReq: buildOauthReq(),
			passkeyUsable: true,
			totpEnrolled: false,
			passphraseModeRequested: true,
		});
		expect(flowState.requiredNextAction).toBe(AUTH_ACTION_APPROVE_PASSKEY);
		expect(flowState.allowedMethods).toEqual([AUTH_ACTION_APPROVE_PASSKEY]);
		const alternateFactorFlowState = createAuthorizeFlowState({
			oauthReq: buildOauthReq(),
			passkeyUsable: true,
			totpEnrolled: true,
			passphraseModeRequested: true,
		});
		expect(alternateFactorFlowState.requiredNextAction).toBe(AUTH_ACTION_APPROVE_PASSKEY);
		expect(alternateFactorFlowState.allowedMethods).toEqual([
			AUTH_ACTION_APPROVE_PASSKEY,
			AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
		]);
	});

	test("encodes skip and TOTP enrollment options explicitly in passkey enrollment state", () => {
		const oauthReq = buildOauthReq();
		const bootstrapState = createPasskeyEnrollmentFlowState({
			oauthReq,
			alternateFactorSatisfied: false,
			allowTotpEnrollment: true,
		});
		expect(bootstrapState.stage).toBe(AUTH_STAGE_ENROLL_PASSKEY);
		expect(bootstrapState.allowedMethods).toEqual([
			AUTH_ACTION_REGISTER_PASSKEY,
			AUTH_ACTION_ENROLL_TOTP,
		]);
		expect(canSkipPasskeyEnrollment(bootstrapState)).toBe(false);
		expect(canStartTotpEnrollment(bootstrapState)).toBe(true);

		const totpSatisfiedState = createPasskeyEnrollmentFlowState({
			oauthReq,
			alternateFactorSatisfied: true,
			allowTotpEnrollment: false,
		});
		expect(totpSatisfiedState.stage).toBe(AUTH_STAGE_ENROLL_PASSKEY);
		expect(totpSatisfiedState.allowedMethods).toEqual([
			AUTH_ACTION_REGISTER_PASSKEY,
			AUTH_ACTION_SKIP_PASSKEY,
		]);
		expect(canSkipPasskeyEnrollment(totpSatisfiedState)).toBe(true);
		expect(canStartTotpEnrollment(totpSatisfiedState)).toBe(false);
	});

	test("rejects semantically invalid stored authorize flow states", () => {
		const oauthReq = buildOauthReq();
		expect(
			parseStoredAuthRequestRecord(
				buildStoredAuthRequestRecord({
					version: 1,
					stage: AUTH_STAGE_AWAITING_PASSKEY,
					oauthReq,
					allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
					requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
				}, "csrf-1"),
			),
		).toBeNull();
		expect(
			parseStoredAuthRequestRecord(
				buildStoredAuthRequestRecord({
					version: 1,
					stage: AUTH_STAGE_AWAITING_PASSPHRASE,
					oauthReq,
					allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
					requiredNextAction: AUTH_ACTION_APPROVE_PASSKEY,
				}, "csrf-1"),
			),
		).toBeNull();
	});

	test("classifies malformed authorize states as denial in the canonical outcome set", () => {
		expect(
			classifyStoredOutcome({
				version: 1,
				stage: AUTH_STAGE_AWAITING_PASSKEY,
				oauthReq: buildOauthReq(),
				allowedMethods: [AUTH_ACTION_APPROVE_PASSKEY],
				requiredNextAction: AUTH_ACTION_APPROVE_PASSPHRASE,
			}),
		).toBe("denial");
	});

	test("rejects semantically invalid passkey enrollment challenge records", () => {
		const oauthReq = buildOauthReq();
		expect(parseChallengeRecordForTest(buildInvalidPasskeyEnrollmentState(oauthReq))).toBeNull();
		expect(parseChallengeRecordForTest(buildAuthorizeStateForChallenge(oauthReq))).toBeNull();
	});

	test("rejects semantically invalid TOTP pending enrollment records", () => {
		const oauthReq = buildOauthReq();
		expect(
			parsePendingTotpForTest(
				"ABCDEFGHIJKLMNOP",
				buildInvalidPendingTotpState(oauthReq),
				buildValidPasskeyEnrollmentState(oauthReq),
			),
		).toBeNull();
		expect(
			parsePendingTotpForTest(
				"ABCDEFGHIJKLMNOP",
				buildValidPasskeyEnrollmentState(oauthReq),
				buildPendingTotpParentState(oauthReq),
			),
		).toBeNull();
		expect(
			parsePendingTotpForTest(
				"ABCDEFGHIJKLMNOP",
				buildValidTotpPendingState(oauthReq),
				buildPendingTotpParentState(oauthReq),
			),
		).toEqual({
			secret: "ABCDEFGHIJKLMNOP",
			csrfToken: "csrf-1",
			flowState: {
				version: 1,
				stage: AUTH_STAGE_ENROLL_TOTP,
				oauthReq,
				allowedMethods: [AUTH_ACTION_VERIFY_TOTP_ENROLLMENT],
				requiredNextAction: AUTH_ACTION_VERIFY_TOTP_ENROLLMENT,
				sourceStage: AUTH_STAGE_ENROLL_PASSKEY,
				sourceAction: AUTH_ACTION_ENROLL_TOTP,
				sourceAllowTotpEnrollment: true,
			},
			sourceFlowState: {
				version: 1,
				stage: AUTH_STAGE_ENROLL_PASSKEY,
				oauthReq,
				allowedMethods: [AUTH_ACTION_REGISTER_PASSKEY, AUTH_ACTION_ENROLL_TOTP],
				requiredNextAction: AUTH_ACTION_REGISTER_PASSKEY,
				alternateFactorSatisfied: false,
				allowTotpEnrollment: true,
			},
		});
	});

	test("buildPendingTotpRecord requires sourceFlowState", () => {
		const oauthReq = buildOauthReq();
		expect(
			buildPendingTotpRecord(
				"ABCDEFGHIJKLMNOP",
				buildValidTotpPendingState(oauthReq),
				"csrf-1",
			),
		).toBeNull();
	});
});
