/** @implements FR-018 — Enrollment route orchestration for passkey skip and TOTP flows. */
import {
	AUTH_ACTION_REGISTER_PASSKEY,
	canSkipPasskeyEnrollment,
	canStartTotpEnrollment,
} from "./auth-flow-state.pure.js";
import { TOTP_SECRET_KEY } from "./auth-shared.pure.js";
import {
	consumePasskeyEnrollmentChallenge,
	parseEnrollActionInput,
	prepareTotpEnrollmentData,
	renderTotpEnrollPage,
	verifyAndCompletePasskeyEnroll,
	consumeAndVerifyTotp,
} from "./auth-route-common.orch.3.js";

export async function handleEnrollPasskey(deps) {
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const input = await parseEnrollActionInput(deps);
	const challengeResult = await consumePasskeyEnrollmentChallenge(
		deps,
		input.enrollNonce,
		input.csrfBody,
		input.csrfCookie,
	);
	if (challengeResult.kind === "invalid_request") {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	if (challengeResult.kind === "missing") {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	if (challengeResult.kind === "invalid_state") {
		return deps.textResponse("Invalid enrollment state. Please start over.", 400);
	}
	if (
		challengeResult.challenge.type !== "registration" ||
		!challengeResult.challenge.flowState.allowedMethods.includes(AUTH_ACTION_REGISTER_PASSKEY)
	) {
		return deps.textResponse("Invalid enrollment state. Please start over.", 400);
	}
	return verifyAndCompletePasskeyEnroll(
		deps,
		input.registrationResponseRaw,
		challengeResult.challenge,
	);
}

export async function handleCompletePasskeySkip(deps) {
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const input = await parseEnrollActionInput(deps);
	const result = await consumePasskeyEnrollmentChallenge(
		deps,
		input.enrollNonce,
		input.csrfBody,
		input.csrfCookie,
	);
	if (result.kind === "invalid_request") {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	if (result.kind === "missing") {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	if (
		result.kind === "invalid_state" ||
		result.challenge.type !== "registration" ||
		!canSkipPasskeyEnrollment(result.challenge.flowState)
	) {
		return deps.textResponse("Invalid enrollment state. Please start over.", 400);
	}
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(result.challenge.flowState.oauthReq));
}

export async function handleEnrollTotpRedirect(deps) {
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const input = await parseEnrollActionInput(deps);
	const result = await consumePasskeyEnrollmentChallenge(
		deps,
		input.enrollNonce,
		input.csrfBody,
		input.csrfCookie,
	);
	if (result.kind === "invalid_request") {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	if (result.kind === "missing") {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	if (
		result.kind === "invalid_state" ||
		result.challenge.type !== "registration" ||
		!canStartTotpEnrollment(result.challenge.flowState)
	) {
		return deps.textResponse("Invalid enrollment state. Please start over.", 400);
	}
	if ((await deps.kvGet(TOTP_SECRET_KEY)) !== null) {
		return deps.textResponse("Authenticator code is already enrolled. Retry authorization.", 400);
	}
	const enrollData = await prepareTotpEnrollmentData(deps, result.challenge.flowState);
	return renderTotpEnrollPage(
		deps,
		enrollData.pendingSecret,
		enrollData.enrollNonce,
		enrollData.csrfToken,
	);
}

export async function handleEnrollTotp(deps) {
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const input = await parseEnrollActionInput(deps);
	if ((await deps.kvGet(TOTP_SECRET_KEY)) !== null) {
		return deps.textResponse("Authenticator code is already enrolled. Retry authorization.", 400);
	}
	const result = await consumeAndVerifyTotp(
		deps,
		input.enrollNonce,
		input.csrfBody,
		input.csrfCookie,
		input.totpCode,
	);
	if (result.kind === "invalid_request") {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	if (result.kind === "missing") {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	if (result.kind === "invalid_state") {
		return deps.textResponse("Invalid enrollment state", 400);
	}
	return result.response;
}
