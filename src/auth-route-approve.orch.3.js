/** @implements FR-018 — Approve route orchestration for passkey/passphrase/TOTP flows. */
import { decidePassphraseApprovalAction } from "./auth-shared.pure.js";
import {
	parseApproveInput,
	consumeStoredAuthRequest,
	failAuthorization,
	completeApprovedAuthorization,
	hasUsablePasskeyCredential,
} from "./auth-route-common.orch.3.js";

async function verifyPasskeyResponse({
	deps,
	webauthnResponseRaw,
	webauthnChallenge,
	passkeyCredential,
}) {
	try {
		const parsed = deps.jsonParse(webauthnResponseRaw);
		if (!parsed) {
			return null;
		}
		const url = deps.parseUrl(deps.getRequestUrl());
		return await deps.verifyAuthentication(
			{
				response: parsed,
				challenge: webauthnChallenge,
				origin: url.origin,
				hostname: url.hostname,
				credential: passkeyCredential,
			},
		);
	} catch {
		return null;
	}
}

async function startPasskeyEnrollmentAfterPassphrase(deps, oauthReqInfo, totpEnrolled) {
	await deps.clearAuthFailures();
	return deps.startPasskeyEnrollment(oauthReqInfo, totpEnrolled);
}

async function verifyApprovedTotpAndContinue(input) {
	if (!(await input.deps.verifyTOTP(input.enrolledTotpSecret, input.totpCode))) {
		return failAuthorization(input.deps);
	}
	if (!input.passkeyUsable) {
		return startPasskeyEnrollmentAfterPassphrase(input.deps, input.oauthReqInfo, true);
	}
	return completeApprovedAuthorization(input.deps, input.oauthReqInfo);
}

async function approveViaPasskey(deps, webauthnResponseRaw, webauthnChallenge, oauthReqInfo) {
	const passkeyCredential = await deps.getCredential();
	if (!passkeyCredential) {
		return failAuthorization(deps);
	}
	const result = await verifyPasskeyResponse({
		deps,
		webauthnResponseRaw,
		webauthnChallenge,
		passkeyCredential,
	});
	if (!result || !result.verified) {
		return failAuthorization(deps);
	}
	await deps.updateCredentialCounter(result.newCounter);
	return completeApprovedAuthorization(deps, oauthReqInfo);
}

async function approveViaPassphrase({
	deps,
	passphrase,
	accessPassphrase,
	totpCode,
	oauthReqInfo,
	allowPassphraseFallback,
}) {
	if (!(await deps.safeStringEqual(passphrase, accessPassphrase))) {
		return failAuthorization(deps);
	}
	const passkeyCredential = await deps.getCredential();
	const passkeyUsable = await hasUsablePasskeyCredential(deps, passkeyCredential);
	const enrolledTotpSecret = await deps.kvGet("ks:totp:secret");
	switch (
		decidePassphraseApprovalAction({
			hasTotpCode: !!totpCode,
			totpEnrolled: enrolledTotpSecret !== null,
			passkeyUsable,
			allowPassphraseFallback,
		})
	) {
		case "verify_totp":
			return verifyApprovedTotpAndContinue({
				deps,
				enrolledTotpSecret,
				totpCode,
				oauthReqInfo,
				passkeyUsable,
			});
		case "start_passkey_enroll":
			return startPasskeyEnrollmentAfterPassphrase(deps, oauthReqInfo, false);
		case "complete":
			return completeApprovedAuthorization(deps, oauthReqInfo);
		default:
			return failAuthorization(deps);
	}
}

export async function handleApprove(deps) {
	if (!deps.accessPassphrase || deps.accessPassphrase.length === 0) {
		return deps.textResponse("Server misconfigured: ACCESS_PASSPHRASE is required.", 500);
	}
	if (await deps.isIpLocked()) {
		return deps.textResponse("Too many failed attempts. Please try again later.", 429);
	}
	const input = await parseApproveInput(deps);
	if (
		!input.requestNonce ||
		!input.csrfBody ||
		!input.csrfCookie ||
		!(await deps.safeStringEqual(input.csrfBody, input.csrfCookie))
	) {
		return deps.textResponse("Invalid authorization request", 400);
	}
	const stored = await consumeStoredAuthRequest(deps, input.requestNonce);
	if (!stored) {
		return deps.textResponse("Authorization request expired. Retry authorization.", 400);
	}
	const oauthReqInfo = stored.oauthReq || stored;
	const fallbackRequested = stored.fallbackRequested === true;
	if (input.webauthnResponseRaw && stored.webauthnChallenge) {
		return approveViaPasskey(
			deps,
			input.webauthnResponseRaw,
			stored.webauthnChallenge,
			oauthReqInfo,
		);
	}
	return approveViaPassphrase({
		deps,
		passphrase: input.passphrase,
		accessPassphrase: deps.accessPassphrase,
		totpCode: input.totpCode,
		oauthReqInfo,
		allowPassphraseFallback: fallbackRequested,
	});
}
