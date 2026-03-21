/** @implements FR-018, FR-011 — Shared auth-route helpers across authorize, approve, and enrollment flows. */
import {
	AUTH_REQUEST_TTL_SECONDS,
	AUTH_REQ_PREFIX,
	TOTP_SECRET_KEY,
	TOTP_PENDING_PREFIX,
	TOTP_PENDING_TTL_SECONDS,
	csrfCookieNameForNonce,
} from "./auth-shared.pure.js";
import {
	AUTH_ACTION_ENROLL_TOTP,
	buildPendingTotpRecord,
	buildStoredAuthRequestRecord,
	buildStoredChallengeRecord,
	canSkipPasskeyEnrollment,
	canStartTotpEnrollment,
	createTotpEnrollmentFlowState,
	parsePendingTotpRecord,
	parseStoredAuthRequestRecord,
	parseStoredChallengeRecord,
} from "./auth-flow-state.pure.js";

function hasUsableStoredPasskeyCredential(passkeyCredential) {
	return !!(
		passkeyCredential &&
		typeof passkeyCredential === "object" &&
		typeof passkeyCredential.id === "string" &&
		passkeyCredential.id.length > 0 &&
		typeof passkeyCredential.publicKey === "string" &&
		passkeyCredential.publicKey.length > 0
	);
}

function hasUsableAuthOptions(authOptions) {
	if (!authOptions || typeof authOptions !== "object") {
		return false;
	}
	return typeof authOptions.challenge === "string" && authOptions.challenge.length > 0;
}

async function verifyTotpAndComplete(deps, pending, totpCode) {
	if (!(await deps.verifyTOTP(pending.secret, totpCode))) {
		await deps.registerAuthFailure();
		return deps.textResponse("Invalid verification code. Please start over.", 403);
	}
	if ((await deps.kvGet(TOTP_SECRET_KEY)) !== null) {
		return deps.textResponse("Authenticator code is already enrolled. Retry authorization.", 400);
	}
	await deps.kvPut(TOTP_SECRET_KEY, pending.secret);
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(pending.flowState.oauthReq));
}

export function parseRequestContext(getRequestUrl, queryParam, parseUrl) {
	const url = parseUrl(getRequestUrl());
	const passphraseModeRequested = queryParam("auth_mode") === "passphrase";
	return { url, passphraseModeRequested };
}

export async function fetchEnrollmentState(getCredential, kvGet) {
	const passkeyCredential = await getCredential();
	const totpSecret = await kvGet(TOTP_SECRET_KEY);
	return {
		passkeyCredential,
		totpEnrolled: totpSecret !== null,
		passkeyEnrolled: passkeyCredential !== null,
	};
}

export async function preparePasskeyAuthData(deps, url, passkeyCredential, totpEnrolled) {
	if (!hasUsableStoredPasskeyCredential(passkeyCredential)) {
		return null;
	}
	const authOptions = await deps.createAuthenticationOptions(url.hostname, passkeyCredential);
	if (!hasUsableAuthOptions(authOptions)) {
		return null;
	}
	const authOptionsJSON = deps.jsonStringify(authOptions);
	const cspNonce = deps.randomToken();
	deps.setCspNonce(cspNonce);
	let passphraseModeUrl = "";
	if (totpEnrolled) {
		const passphraseUrl = new URL(url.toString());
		passphraseUrl.searchParams.set("auth_mode", "passphrase");
		passphraseModeUrl = passphraseUrl.pathname + passphraseUrl.search;
	}
	return { authOptionsJSON, cspNonce, passphraseModeUrl, webauthnChallenge: authOptions.challenge };
}

export async function hasUsablePasskeyCredential(deps, passkeyCredential) {
	if (!hasUsableStoredPasskeyCredential(passkeyCredential)) {
		return false;
	}
	const url = deps.parseUrl(deps.getRequestUrl());
	const authOptions = await deps.createAuthenticationOptions(url.hostname, passkeyCredential);
	return hasUsableAuthOptions(authOptions);
}

export async function persistAndRenderAuthPage({
	deps,
	requestNonce,
	csrfToken,
	flowState,
	webauthnChallenge,
	pageData,
}) {
	await deps.kvPut(
		AUTH_REQ_PREFIX + requestNonce,
		deps.jsonStringify(buildStoredAuthRequestRecord(flowState, csrfToken, webauthnChallenge)),
		AUTH_REQUEST_TTL_SECONDS,
	);
	deps.setCookie(csrfCookieNameForNonce(requestNonce), csrfToken);
	return deps.htmlResponse(
		deps.renderAuthPage({
			requestNonce,
			csrfToken,
			...pageData,
		}),
	);
}

function renderPasskeyEnrollPage({ deps, enrollNonce, csrfToken, cspNonce, regOptions, flowState }) {
	deps.setCookie(csrfCookieNameForNonce(enrollNonce), csrfToken);
	deps.setCspNonce(cspNonce);
	return deps.htmlResponse(
		deps.renderEnrollPasskeyPage({
			enrollNonce,
			csrfToken,
			optionsJSON: deps.jsonStringify(regOptions),
			cspNonce,
			canSkipPasskey: canSkipPasskeyEnrollment(flowState),
			canStartTotpEnrollment: canStartTotpEnrollment(flowState),
		}),
	);
}

export async function startPasskeyEnrollment(deps, flowState) {
	const url = deps.parseUrl(deps.getRequestUrl());
	const existingCred = await deps.getCredential();
	const regOptions = await deps.createRegistrationOptions(url.hostname, "Lore", existingCred);
	const enrollNonce = deps.randomToken();
	const csrfToken = deps.randomToken();
	const cspNonce = deps.randomToken();
	await deps.storeChallenge(
		enrollNonce,
		buildStoredChallengeRecord(regOptions.challenge, flowState, "registration", csrfToken),
	);
	return renderPasskeyEnrollPage({
		deps,
		enrollNonce,
		csrfToken,
		cspNonce,
		regOptions,
		flowState,
	});
}

export async function parseApproveInput(deps) {
	const body = await deps.parseBody();
	const requestNonce = deps.bodyString(body.request_nonce);
	return {
		passphrase: deps.bodyString(body.passphrase),
		requestNonce,
		csrfBody: deps.bodyString(body.csrf_token),
		csrfCookie: requestNonce ? deps.getCookie(csrfCookieNameForNonce(requestNonce)) : "",
		totpCode: deps.bodyString(body.totp_code),
		webauthnResponseRaw: deps.bodyString(body.webauthn_response),
	};
}

export async function parseEnrollActionInput(deps) {
	const body = await deps.parseBody();
	const enrollNonce = deps.bodyString(body.enroll_nonce);
	return {
		enrollNonce,
		csrfBody: deps.bodyString(body.csrf_token),
		csrfCookie: enrollNonce ? deps.getCookie(csrfCookieNameForNonce(enrollNonce)) : "",
		registrationResponseRaw: deps.bodyString(body.registration_response),
		totpCode: deps.bodyString(body.totp_code),
	};
}

function parsedRecordOrNull(deps, raw, parseRecord) {
	try {
		return parseRecord(deps.jsonParse(raw));
	} catch {
		return null;
	}
}

export async function consumeStoredAuthRequest(deps, requestNonce, csrfBody, csrfCookie) {
	const raw = await deps.kvGet(AUTH_REQ_PREFIX + requestNonce);
	deps.deleteCookie(csrfCookieNameForNonce(requestNonce));
	if (!raw) {
		return { kind: "missing" };
	}
	await deps.kvDelete(AUTH_REQ_PREFIX + requestNonce);
	const record = parsedRecordOrNull(deps, raw, parseStoredAuthRequestRecord);
	if (!record) {
		return { kind: "invalid" };
	}
	if (!csrfBody || !csrfCookie || !(await deps.safeStringEqual(csrfBody, csrfCookie))) {
		return { kind: "invalid" };
	}
	if (!(await deps.safeStringEqual(csrfBody, record.csrfToken))) {
		return { kind: "invalid" };
	}
	return { kind: "ok", record };
}

export async function failAuthorization(deps) {
	await deps.registerAuthFailure();
	return deps.textResponse("Authorization failed", 403);
}

export async function completeApprovedAuthorization(deps, oauthReqInfo) {
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(oauthReqInfo));
}

export async function consumePasskeyEnrollmentChallenge(deps, enrollNonce, csrfBody, csrfCookie) {
	if (
		!enrollNonce ||
		!csrfBody ||
		!csrfCookie ||
		!(await deps.safeStringEqual(csrfBody, csrfCookie))
	) {
		return { kind: "invalid_request" };
	}
	deps.deleteCookie(csrfCookieNameForNonce(enrollNonce));
	let rawChallenge;
	try {
		rawChallenge = await deps.consumeChallenge(enrollNonce);
	} catch {
		return { kind: "invalid_state" };
	}
	if (!rawChallenge) {
		return { kind: "missing" };
	}
	const challenge = parseStoredChallengeRecord(rawChallenge);
	if (!challenge) {
		return { kind: "invalid_state" };
	}
	if (!(await deps.safeStringEqual(csrfBody, challenge.csrfToken))) {
		return { kind: "invalid_state" };
	}
	return { challenge };
}

export async function prepareTotpEnrollmentData(deps, flowState) {
	if (!canStartTotpEnrollment(flowState)) {
		throw new Error("Invalid TOTP enrollment source flow.");
	}
	const pendingSecret = deps.generateSecret();
	const enrollNonce = deps.randomToken();
	const csrfToken = deps.randomToken();
	await deps.kvPut(
		TOTP_PENDING_PREFIX + enrollNonce,
		deps.jsonStringify(
			buildPendingTotpRecord(
				pendingSecret,
				createTotpEnrollmentFlowState({
					oauthReq: flowState.oauthReq,
					sourceStage: flowState.stage,
					sourceAction: AUTH_ACTION_ENROLL_TOTP,
				}),
				csrfToken,
				flowState,
			),
		),
		TOTP_PENDING_TTL_SECONDS,
	);
	deps.setCookie(csrfCookieNameForNonce(enrollNonce), csrfToken);
	return { pendingSecret, enrollNonce, csrfToken };
}

export function renderTotpEnrollPage(deps, pendingSecret, enrollNonce, csrfToken) {
	const uri = deps.buildOtpAuthUri({ secret: pendingSecret });
	const qrSvg = deps.generateQrSvg(uri);
	return deps.htmlResponse(
		deps.renderEnrollTotpPage({
			qrSvg,
			secretDisplay: deps.formatSecretForDisplay(pendingSecret),
			enrollNonce,
			csrfToken,
		}),
	);
}

export async function verifyAndCompletePasskeyEnroll(
	deps,
	registrationResponseRaw,
	challenge,
) {
	let parsed;
	try {
		parsed = deps.jsonParse(registrationResponseRaw);
	} catch {
		parsed = null;
	}
	if (!parsed) {
		await deps.registerAuthFailure();
		return deps.textResponse("Invalid registration data", 400);
	}
	const url = deps.parseUrl(deps.getRequestUrl());
	const credential = await deps.verifyRegistration(
		parsed,
		challenge.challenge,
		url.origin,
		url.hostname,
	);
	if (!credential) {
		await deps.registerAuthFailure();
		return deps.textResponse("Passkey registration failed. Please start over.", 403);
	}
	await deps.storeCredential(credential);
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(challenge.flowState.oauthReq));
}

export async function consumeAndVerifyTotp(deps, enrollNonce, csrfBody, csrfCookie, totpCode) {
	if (
		!enrollNonce ||
		!csrfBody ||
		!csrfCookie ||
		!(await deps.safeStringEqual(csrfBody, csrfCookie))
	) {
		return { kind: "invalid_request" };
	}
	const pendingKey = TOTP_PENDING_PREFIX + enrollNonce;
	const pendingRaw = await deps.kvGet(pendingKey);
	deps.deleteCookie(csrfCookieNameForNonce(enrollNonce));
	if (!pendingRaw) {
		return { kind: "missing" };
	}
	await deps.kvDelete(pendingKey);
	const pending = parsedRecordOrNull(deps, pendingRaw, parsePendingTotpRecord);
	if (!pending) {
		return { kind: "invalid_state" };
	}
	if (!(await deps.safeStringEqual(csrfBody, pending.csrfToken))) {
		return { kind: "invalid_state" };
	}
	return { kind: "ok", response: await verifyTotpAndComplete(deps, pending, totpCode) };
}
