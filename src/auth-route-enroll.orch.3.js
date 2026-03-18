/** @implements FR-018 — Enrollment route orchestration for passkey skip and TOTP flows. */
import { CSRF_COOKIE_NAME } from "./auth-shared.pure.js";
import {
	validateQueryCsrfAndConsume,
	prepareTotpEnrollmentData,
	renderTotpEnrollPage,
	verifyAndCompletePasskeyEnroll,
	consumeAndVerifyTotp,
} from "./auth-route-common.orch.3.js";

export async function handleEnrollPasskey(deps) {
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const body = await deps.parseBody();
	const enrollNonce = deps.bodyString(body.enroll_nonce);
	const registrationResponseRaw = deps.bodyString(body.registration_response);
	const csrfBody = deps.bodyString(body.csrf_token);
	const csrfCookie = deps.getCookie(CSRF_COOKIE_NAME);
	if (
		!enrollNonce ||
		!csrfBody ||
		!csrfCookie ||
		!(await deps.safeStringEqual(csrfBody, csrfCookie))
	) {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	const challenge = await deps.consumeChallenge(enrollNonce);
	deps.deleteCookie(CSRF_COOKIE_NAME);
	if (!challenge || challenge.type !== "registration") {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	return verifyAndCompletePasskeyEnroll(deps, registrationResponseRaw, challenge);
}

export async function handleCompletePasskeySkip(deps) {
	const result = await validateQueryCsrfAndConsume(deps);
	if (result.error) {
		return result.error;
	}
	return deps.redirectResponse(await deps.completeAuthorization(result.challenge.oauthReq));
}

export async function handleEnrollTotpRedirect(deps) {
	const result = await validateQueryCsrfAndConsume(deps);
	if (result.error) {
		return result.error;
	}
	const enrollData = await prepareTotpEnrollmentData(deps, result.challenge.oauthReq);
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
	const body = await deps.parseBody();
	const enrollNonce = deps.bodyString(body.enroll_nonce);
	const totpCode = deps.bodyString(body.totp_code);
	const csrfBody = deps.bodyString(body.csrf_token);
	const csrfCookie = deps.getCookie(CSRF_COOKIE_NAME);
	if (
		!enrollNonce ||
		!csrfBody ||
		!csrfCookie ||
		!(await deps.safeStringEqual(csrfBody, csrfCookie))
	) {
		return deps.textResponse("Invalid enrollment request", 400);
	}
	return consumeAndVerifyTotp(deps, enrollNonce, totpCode);
}
