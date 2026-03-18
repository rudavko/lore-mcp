/** @implements FR-018, FR-011 — Shared auth-route helpers across authorize, approve, and enrollment flows. */
import {
	AUTH_REQUEST_TTL_SECONDS,
	CSRF_COOKIE_NAME,
	AUTH_REQ_PREFIX,
	TOTP_SECRET_KEY,
	TOTP_PENDING_PREFIX,
	TOTP_PENDING_TTL_SECONDS,
} from "./auth-shared.pure.js";

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
	await deps.kvPut(TOTP_SECRET_KEY, pending.secret);
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(pending.oauthReq));
}

export function parseRequestContext(getRequestUrl, queryParam, parseUrl) {
	const url = parseUrl(getRequestUrl());
	const fallbackRequested = queryParam("fallback") !== "";
	return { url, fallbackRequested };
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
	let fallbackUrl = "";
	if (totpEnrolled) {
		const hasQuery = url.search.length > 0;
		const separator = hasQuery ? "&" : "?";
		fallbackUrl = url.pathname + url.search + separator + "fallback=1";
	}
	return { authOptionsJSON, cspNonce, fallbackUrl, webauthnChallenge: authOptions.challenge };
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
	stored,
	pageData,
}) {
	await deps.kvPut(
		AUTH_REQ_PREFIX + requestNonce,
		deps.jsonStringify(stored),
		AUTH_REQUEST_TTL_SECONDS,
	);
	deps.setCookie(CSRF_COOKIE_NAME, csrfToken);
	return deps.htmlResponse(
		deps.renderAuthPage({
			requestNonce,
			csrfToken,
			...pageData,
		}),
	);
}

function renderPasskeyEnrollPage({ deps, enrollNonce, csrfToken, cspNonce, regOptions, totpEnrolled }) {
	deps.setCookie(CSRF_COOKIE_NAME, csrfToken);
	deps.setCspNonce(cspNonce);
	return deps.htmlResponse(
		deps.renderEnrollPasskeyPage({
			enrollNonce,
			csrfToken,
			optionsJSON: deps.jsonStringify(regOptions),
			cspNonce,
			totpEnrolled,
		}),
	);
}

export async function startPasskeyEnrollment(deps, oauthReq, totpEnrolled) {
	const url = deps.parseUrl(deps.getRequestUrl());
	const existingCred = await deps.getCredential();
	const regOptions = await deps.createRegistrationOptions(url.hostname, "Lore", existingCred);
	const enrollNonce = deps.randomToken();
	const csrfToken = deps.randomToken();
	const cspNonce = deps.randomToken();
	await deps.storeChallenge(enrollNonce, regOptions.challenge, oauthReq, "registration");
	return renderPasskeyEnrollPage({
		deps,
		enrollNonce,
		csrfToken,
		cspNonce,
		regOptions,
		totpEnrolled,
	});
}

export async function parseApproveInput(deps) {
	const body = await deps.parseBody();
	return {
		passphrase: deps.bodyString(body.passphrase),
		requestNonce: deps.bodyString(body.request_nonce),
		csrfBody: deps.bodyString(body.csrf_token),
		csrfCookie: deps.getCookie(CSRF_COOKIE_NAME),
		totpCode: deps.bodyString(body.totp_code),
		webauthnResponseRaw: deps.bodyString(body.webauthn_response),
	};
}

export async function consumeStoredAuthRequest(deps, requestNonce) {
	const raw = await deps.kvGet(AUTH_REQ_PREFIX + requestNonce);
	await deps.kvDelete(AUTH_REQ_PREFIX + requestNonce);
	deps.deleteCookie(CSRF_COOKIE_NAME);
	if (!raw) {
		return null;
	}
	return deps.jsonParse(raw);
}

export async function failAuthorization(deps) {
	await deps.registerAuthFailure();
	return deps.textResponse("Authorization failed", 403);
}

export async function completeApprovedAuthorization(deps, oauthReqInfo) {
	await deps.clearAuthFailures();
	return deps.redirectResponse(await deps.completeAuthorization(oauthReqInfo));
}

export async function validateQueryCsrfAndConsume(deps) {
	const nonce = deps.queryParam("nonce");
	const csrfParam = deps.queryParam("csrf");
	const csrfCookie = deps.getCookie(CSRF_COOKIE_NAME);
	if (
		!nonce ||
		!csrfParam ||
		!csrfCookie ||
		!(await deps.safeStringEqual(csrfParam, csrfCookie))
	) {
		return { error: deps.textResponse("Invalid request", 400) };
	}
	const challenge = await deps.consumeChallenge(nonce);
	deps.deleteCookie(CSRF_COOKIE_NAME);
	if (!challenge) {
		return { error: deps.textResponse("Session expired. Please start over.", 400) };
	}
	return { challenge };
}

export async function prepareTotpEnrollmentData(deps, challengeOauthReq) {
	const pendingSecret = deps.generateSecret();
	const enrollNonce = deps.randomToken();
	const csrfToken = deps.randomToken();
	await deps.kvPut(
		TOTP_PENDING_PREFIX + enrollNonce,
		deps.jsonStringify({ secret: pendingSecret, oauthReq: challengeOauthReq }),
		TOTP_PENDING_TTL_SECONDS,
	);
	deps.setCookie(CSRF_COOKIE_NAME, csrfToken);
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
	const parsed = deps.jsonParse(registrationResponseRaw);
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
	return deps.redirectResponse(await deps.completeAuthorization(challenge.oauthReq));
}

export async function consumeAndVerifyTotp(deps, enrollNonce, totpCode) {
	const pendingKey = TOTP_PENDING_PREFIX + enrollNonce;
	const pendingRaw = await deps.kvGet(pendingKey);
	await deps.kvDelete(pendingKey);
	deps.deleteCookie(CSRF_COOKIE_NAME);
	if (!pendingRaw) {
		return deps.textResponse("Enrollment expired. Please start over.", 400);
	}
	const pending = deps.jsonParse(pendingRaw);
	if (!pending) {
		return deps.textResponse("Invalid enrollment state", 400);
	}
	return verifyTotpAndComplete(deps, pending, totpCode);
}
