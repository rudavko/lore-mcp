/** @implements FR-018 — Pure auth flow-state builders and validators. */
export const _MODULE = "auth-flow-state.pure";
export const AUTH_FLOW_VERSION = 1;
export const AUTH_STAGE_AWAITING_PASSKEY = "awaiting_passkey";
export const AUTH_STAGE_AWAITING_PASSPHRASE = "awaiting_passphrase";
export const AUTH_STAGE_AWAITING_PASSPHRASE_TOTP = "awaiting_passphrase_totp";
export const AUTH_STAGE_ENROLL_PASSKEY = "enroll_passkey";
export const AUTH_STAGE_ENROLL_TOTP = "enroll_totp";
export const AUTH_ACTION_APPROVE_PASSKEY = "approve_passkey";
export const AUTH_ACTION_APPROVE_PASSPHRASE = "approve_passphrase";
export const AUTH_ACTION_APPROVE_PASSPHRASE_TOTP = "approve_passphrase_totp";
export const AUTH_ACTION_REGISTER_PASSKEY = "register_passkey";
export const AUTH_ACTION_SKIP_PASSKEY = "skip_passkey";
export const AUTH_ACTION_ENROLL_TOTP = "enroll_totp";
export const AUTH_ACTION_VERIFY_TOTP_ENROLLMENT = "verify_totp_enrollment";

function isObject(value) {
	return !!value && typeof value === "object";
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function isAllowedMethods(value) {
	return Array.isArray(value) && value.every((method) => typeof method === "string");
}

function isOauthRequest(value) {
	return (
		isObject(value) &&
		isNonEmptyString(value.clientId) &&
		isNonEmptyString(value.responseType) &&
		isNonEmptyString(value.redirectUri) &&
		Array.isArray(value.scope)
	);
}

function hasAllowedMethod(flowState, method) {
	return Array.isArray(flowState.allowedMethods) && flowState.allowedMethods.includes(method);
}

function hasNoDuplicateMethods(methods) {
	return new Set(methods).size === methods.length;
}

function hasExactAllowedMethods(methods, expected) {
	return (
		Array.isArray(methods) &&
		methods.length === expected.length &&
		expected.every((method, index) => methods[index] === method)
	);
}

function hasOnlyAllowedMethods(methods, expected) {
	return (
		Array.isArray(methods) &&
		methods.every((method) => expected.includes(method))
	);
}

function baseFlowState(stage, oauthReq, allowedMethods, requiredNextAction) {
	return {
		version: AUTH_FLOW_VERSION,
		stage,
		oauthReq,
		allowedMethods,
		requiredNextAction,
	};
}

export function createAuthorizeFlowState({
	oauthReq,
	passkeyUsable,
	totpEnrolled,
}) {
	if (passkeyUsable) {
		const allowedMethods = [AUTH_ACTION_APPROVE_PASSKEY];
		if (totpEnrolled) {
			allowedMethods.push(AUTH_ACTION_APPROVE_PASSPHRASE_TOTP);
		}
		const flowState = baseFlowState(
			AUTH_STAGE_AWAITING_PASSKEY,
			oauthReq,
			allowedMethods,
			AUTH_ACTION_APPROVE_PASSKEY,
		);
		if (totpEnrolled) {
			flowState.passphraseModeAvailable = true;
		}
		return flowState;
	}
	if (totpEnrolled) {
		return baseFlowState(
			AUTH_STAGE_AWAITING_PASSPHRASE_TOTP,
			oauthReq,
			[AUTH_ACTION_APPROVE_PASSPHRASE_TOTP],
			AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
		);
	}
	return baseFlowState(
		AUTH_STAGE_AWAITING_PASSPHRASE,
		oauthReq,
		[AUTH_ACTION_APPROVE_PASSPHRASE],
		AUTH_ACTION_APPROVE_PASSPHRASE,
	);
}

export function createPasskeyEnrollmentFlowState({
	oauthReq,
	alternateFactorSatisfied,
	allowTotpEnrollment,
}) {
	const allowedMethods = [AUTH_ACTION_REGISTER_PASSKEY];
	if (alternateFactorSatisfied) {
		allowedMethods.push(AUTH_ACTION_SKIP_PASSKEY);
	}
	if (allowTotpEnrollment) {
		allowedMethods.push(AUTH_ACTION_ENROLL_TOTP);
	}
	return {
		...baseFlowState(
			AUTH_STAGE_ENROLL_PASSKEY,
			oauthReq,
			allowedMethods,
			AUTH_ACTION_REGISTER_PASSKEY,
		),
		alternateFactorSatisfied: alternateFactorSatisfied === true,
		allowTotpEnrollment: allowTotpEnrollment === true,
	};
}

export function createTotpEnrollmentFlowState({ oauthReq, sourceStage, sourceAction }) {
	return {
		...baseFlowState(
			AUTH_STAGE_ENROLL_TOTP,
			oauthReq,
			[AUTH_ACTION_VERIFY_TOTP_ENROLLMENT],
			AUTH_ACTION_VERIFY_TOTP_ENROLLMENT,
		),
		sourceStage,
		sourceAction,
		sourceAllowTotpEnrollment: true,
	};
}

export function buildStoredAuthRequestRecord(flowState, csrfToken, webauthnChallenge) {
	const record = { flowState, csrfToken };
	if (isNonEmptyString(webauthnChallenge)) {
		record.webauthnChallenge = webauthnChallenge;
	}
	return record;
}

export function buildStoredChallengeRecord(challenge, flowState, type, csrfToken) {
	return { challenge, flowState, type, csrfToken };
}

function hasMatchingOauthRequest(left, right) {
	return (
		isOauthRequest(left) &&
		isOauthRequest(right) &&
		left.clientId === right.clientId &&
		left.responseType === right.responseType &&
		left.redirectUri === right.redirectUri &&
		Array.isArray(left.scope) &&
		Array.isArray(right.scope) &&
		left.scope.length === right.scope.length &&
		left.scope.every((value, index) => value === right.scope[index])
	);
}

export function buildPendingTotpRecord(secret, flowState, csrfToken, sourceFlowState) {
	const record = { secret, flowState, csrfToken };
	if (sourceFlowState !== undefined) {
		record.sourceFlowState = sourceFlowState;
	}
	return record;
}

function isAuthorizeStage(stage) {
	return (
		stage === AUTH_STAGE_AWAITING_PASSKEY ||
		stage === AUTH_STAGE_AWAITING_PASSPHRASE ||
		stage === AUTH_STAGE_AWAITING_PASSPHRASE_TOTP
	);
}

function isPasskeyEnrollStage(stage) {
	return stage === AUTH_STAGE_ENROLL_PASSKEY;
}

function isTotpEnrollStage(stage) {
	return stage === AUTH_STAGE_ENROLL_TOTP;
}

function isValidFlowState(value) {
	return (
		isObject(value) &&
		value.version === AUTH_FLOW_VERSION &&
		isNonEmptyString(value.stage) &&
		isOauthRequest(value.oauthReq) &&
		isAllowedMethods(value.allowedMethods) &&
		hasNoDuplicateMethods(value.allowedMethods) &&
		isNonEmptyString(value.requiredNextAction)
	);
}

function hasNoEnrollmentFlags(flowState) {
	return (
		flowState.alternateFactorSatisfied === undefined &&
		flowState.allowTotpEnrollment === undefined
	);
}

function hasNoPassphraseModeFlag(flowState) {
	return flowState.passphraseModeAvailable === undefined;
}

function hasNoTotpEnrollmentSource(flowState) {
	return (
		flowState.sourceStage === undefined &&
		flowState.sourceAction === undefined &&
		flowState.sourceAllowTotpEnrollment === undefined
	);
}

function isSemanticallyValidAuthorizeFlowState(flowState) {
	switch (flowState.stage) {
		case AUTH_STAGE_AWAITING_PASSKEY:
			return (
				((flowState.passphraseModeAvailable === true &&
					hasExactAllowedMethods(flowState.allowedMethods, [
						AUTH_ACTION_APPROVE_PASSKEY,
						AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
					])) ||
					(flowState.passphraseModeAvailable === undefined &&
						hasExactAllowedMethods(flowState.allowedMethods, [AUTH_ACTION_APPROVE_PASSKEY]))) &&
				flowState.requiredNextAction === AUTH_ACTION_APPROVE_PASSKEY &&
				(flowState.passphraseModeAvailable === undefined ||
					flowState.passphraseModeAvailable === true) &&
				hasNoEnrollmentFlags(flowState) &&
				hasNoTotpEnrollmentSource(flowState)
			);
		case AUTH_STAGE_AWAITING_PASSPHRASE:
			return (
				hasExactAllowedMethods(flowState.allowedMethods, [AUTH_ACTION_APPROVE_PASSPHRASE]) &&
				flowState.requiredNextAction === AUTH_ACTION_APPROVE_PASSPHRASE &&
				hasNoEnrollmentFlags(flowState) &&
				hasNoPassphraseModeFlag(flowState) &&
				hasNoTotpEnrollmentSource(flowState)
			);
		case AUTH_STAGE_AWAITING_PASSPHRASE_TOTP:
			return (
				hasExactAllowedMethods(flowState.allowedMethods, [AUTH_ACTION_APPROVE_PASSPHRASE_TOTP]) &&
				flowState.requiredNextAction === AUTH_ACTION_APPROVE_PASSPHRASE_TOTP &&
				hasNoEnrollmentFlags(flowState) &&
				hasNoPassphraseModeFlag(flowState) &&
				hasNoTotpEnrollmentSource(flowState)
			);
		default:
			return false;
	}
}

function isSemanticallyValidPasskeyEnrollFlowState(flowState) {
	const allowSkip = flowState.alternateFactorSatisfied === true;
	const allowTotpEnrollment = flowState.allowTotpEnrollment === true;
	return (
		flowState.stage === AUTH_STAGE_ENROLL_PASSKEY &&
		flowState.requiredNextAction === AUTH_ACTION_REGISTER_PASSKEY &&
		hasAllowedMethod(flowState, AUTH_ACTION_REGISTER_PASSKEY) &&
		hasOnlyAllowedMethods(flowState.allowedMethods, [
			AUTH_ACTION_REGISTER_PASSKEY,
			AUTH_ACTION_SKIP_PASSKEY,
			AUTH_ACTION_ENROLL_TOTP,
		]) &&
		(allowSkip === hasAllowedMethod(flowState, AUTH_ACTION_SKIP_PASSKEY)) &&
		(allowTotpEnrollment === hasAllowedMethod(flowState, AUTH_ACTION_ENROLL_TOTP)) &&
		typeof flowState.alternateFactorSatisfied === "boolean" &&
		typeof flowState.allowTotpEnrollment === "boolean" &&
		hasNoPassphraseModeFlag(flowState) &&
		hasNoTotpEnrollmentSource(flowState)
	);
}

function isSemanticallyValidTotpEnrollFlowState(flowState) {
	return (
		flowState.stage === AUTH_STAGE_ENROLL_TOTP &&
		hasExactAllowedMethods(flowState.allowedMethods, [AUTH_ACTION_VERIFY_TOTP_ENROLLMENT]) &&
		flowState.requiredNextAction === AUTH_ACTION_VERIFY_TOTP_ENROLLMENT &&
		hasNoEnrollmentFlags(flowState) &&
		hasNoPassphraseModeFlag(flowState) &&
		flowState.sourceStage === AUTH_STAGE_ENROLL_PASSKEY &&
		flowState.sourceAction === AUTH_ACTION_ENROLL_TOTP &&
		flowState.sourceAllowTotpEnrollment === true
	);
}

export function parseStoredAuthRequestRecord(value) {
	if (
		!isObject(value) ||
		!isNonEmptyString(value.csrfToken) ||
		!isValidFlowState(value.flowState) ||
		!isAuthorizeStage(value.flowState.stage) ||
		!isSemanticallyValidAuthorizeFlowState(value.flowState)
	) {
		return null;
	}
	if (
		value.webauthnChallenge !== undefined &&
		typeof value.webauthnChallenge !== "string"
	) {
		return null;
	}
	return value;
}

export function parseStoredChallengeRecord(value) {
	if (
		!isObject(value) ||
		!isNonEmptyString(value.challenge) ||
		value.type !== "registration" ||
		!isNonEmptyString(value.csrfToken) ||
		!isValidFlowState(value.flowState) ||
		!isPasskeyEnrollStage(value.flowState.stage) ||
		!isSemanticallyValidPasskeyEnrollFlowState(value.flowState)
	) {
		return null;
	}
	return value;
}

export function parsePendingTotpRecord(value) {
	if (
		!isObject(value) ||
		!isNonEmptyString(value.secret) ||
		!isNonEmptyString(value.csrfToken) ||
		!isValidFlowState(value.sourceFlowState) ||
		!isPasskeyEnrollStage(value.sourceFlowState.stage) ||
		!isSemanticallyValidPasskeyEnrollFlowState(value.sourceFlowState) ||
		!canStartTotpEnrollment(value.sourceFlowState) ||
		!isValidFlowState(value.flowState) ||
		!isTotpEnrollStage(value.flowState.stage) ||
		!isSemanticallyValidTotpEnrollFlowState(value.flowState) ||
		!hasMatchingOauthRequest(value.flowState.oauthReq, value.sourceFlowState.oauthReq)
	) {
		return null;
	}
	return value;
}

export function authPageMode(flowState) {
	switch (flowState.stage) {
		case AUTH_STAGE_AWAITING_PASSKEY:
			return "passkey";
		case AUTH_STAGE_AWAITING_PASSPHRASE:
		case AUTH_STAGE_AWAITING_PASSPHRASE_TOTP:
			return "passphrase";
		default:
			return "deny";
	}
}

export function requiresTotp(flowState) {
	return flowState.stage === AUTH_STAGE_AWAITING_PASSPHRASE_TOTP;
}

export function isPassphraseModeAvailable(flowState) {
	return flowState.stage === AUTH_STAGE_AWAITING_PASSKEY && flowState.passphraseModeAvailable === true;
}

export function resolvePassphraseApprovalAction(flowState) {
	if (!isValidFlowState(flowState) || !isAuthorizeStage(flowState.stage)) {
		return null;
	}
	if (!isSemanticallyValidAuthorizeFlowState(flowState)) {
		return null;
	}
	switch (flowState.stage) {
		case AUTH_STAGE_AWAITING_PASSPHRASE:
			return AUTH_ACTION_APPROVE_PASSPHRASE;
		case AUTH_STAGE_AWAITING_PASSPHRASE_TOTP:
			return AUTH_ACTION_APPROVE_PASSPHRASE_TOTP;
		case AUTH_STAGE_AWAITING_PASSKEY:
			return isPassphraseModeAvailable(flowState)
				? AUTH_ACTION_APPROVE_PASSPHRASE_TOTP
				: null;
		default:
			return null;
	}
}

export function canSkipPasskeyEnrollment(flowState) {
	return (
		flowState.stage === AUTH_STAGE_ENROLL_PASSKEY &&
		flowState.alternateFactorSatisfied === true &&
		hasAllowedMethod(flowState, AUTH_ACTION_SKIP_PASSKEY)
	);
}

export function canStartTotpEnrollment(flowState) {
	return (
		flowState.stage === AUTH_STAGE_ENROLL_PASSKEY &&
		flowState.allowTotpEnrollment === true &&
		hasAllowedMethod(flowState, AUTH_ACTION_ENROLL_TOTP)
	);
}
