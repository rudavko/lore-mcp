/** @implements FR-011 — Shared low-level auth browser-step helpers for exported-worker tests. */
import {
	ACCESS_PASSPHRASE,
	buildAuthorizePath,
	exchangeCodeForToken,
	extractAuthorizationCode,
	generateTotpCode,
	workerFetch,
	workerFetchWithCookies,
} from "./auth-wiring-env.test-helpers.js";
import {
	extractHiddenInputValue,
	extractHref,
	extractSecretDisplay,
} from "./test-helpers/html-scrape.test.js";

function buildApproveBody({
	requestNonce,
	csrfToken,
	passphrase = ACCESS_PASSPHRASE,
	totpCode,
	webauthnResponse,
}) {
	const body = {
		request_nonce: requestNonce,
		csrf_token: csrfToken,
		passphrase,
	};
	if (typeof totpCode === "string" && totpCode.length > 0) {
		body.totp_code = totpCode;
	}
	if (typeof webauthnResponse === "string" && webauthnResponse.length > 0) {
		body.webauthn_response = webauthnResponse;
	}
	return new URLSearchParams(body).toString();
}

function buildTotpEnrollmentBody({ enrollNonce, csrfToken, totpCode }) {
	return new URLSearchParams({
		enroll_nonce: enrollNonce,
		csrf_token: csrfToken,
		totp_code: totpCode,
	}).toString();
}

export async function requestAuthorizeForm({ env, ctx, clientId, fallback = false, jar = new Map() }) {
	const step = await workerFetchWithCookies({
		env,
		ctx,
		jar,
		path: buildAuthorizePath(clientId, fallback ? { fallback: true } : undefined),
	});
	const html = await step.response.text();
	return {
		jar: step.jar,
		html,
		requestNonce: extractHiddenInputValue(html, "request_nonce"),
		csrfToken: extractHiddenInputValue(html, "csrf_token"),
	};
}

export async function submitApproveForm({
	env,
	ctx,
	jar,
	requestNonce,
	csrfToken,
	passphrase,
	totpCode,
	ip,
	webauthnResponse,
}) {
	const headers = { "content-type": "application/x-www-form-urlencoded" };
	if (typeof ip === "string" && ip.length > 0) {
		headers["CF-Connecting-IP"] = ip;
	}
	return await workerFetchWithCookies({
		env,
		ctx,
		jar,
		path: "/approve",
		init: {
			method: "POST",
			headers,
			body: buildApproveBody({
				requestNonce,
				csrfToken,
				passphrase,
				totpCode,
				webauthnResponse,
			}),
		},
	});
}

export async function submitLockedApproveForm({
	env,
	ctx,
	requestNonce,
	csrfToken,
	ip,
	passphrase = ACCESS_PASSPHRASE,
}) {
	return await workerFetch(env, ctx, "/approve", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			"CF-Connecting-IP": ip,
			cookie: `ks_csrf=${csrfToken}`,
		},
		body: buildApproveBody({
			requestNonce,
			csrfToken,
			passphrase,
		}),
	});
}

export async function followPasskeySkipToTotp({ env, ctx, jar, passkeyEnrollHtml }) {
	const skipPath = extractHref(passkeyEnrollHtml, "/enroll-totp-redirect");
	const step = await workerFetchWithCookies({
		env,
		ctx,
		jar,
		path: skipPath,
	});
	const totpPageHtml = await step.response.text();
	return {
		jar: step.jar,
		totpPageHtml,
	};
}

export async function submitTotpEnrollmentForm({
	env,
	ctx,
	jar,
	enrollNonce,
	csrfToken,
	totpCode,
}) {
	return await workerFetchWithCookies({
		env,
		ctx,
		jar,
		path: "/enroll-totp",
		init: {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: buildTotpEnrollmentBody({
				enrollNonce,
				csrfToken,
				totpCode,
			}),
		},
	});
}

export async function exchangeAuthorizationLocation({
	env,
	ctx,
	clientId,
	location,
}) {
	const { code, state } = extractAuthorizationCode(location);
	const tokenResponse = await exchangeCodeForToken(env, ctx, clientId, code);
	return {
		code,
		state,
		tokenResponse,
	};
}

export async function buildTotpEnrollmentState({ env, ctx, jar, clientId }) {
	const authorize = await requestAuthorizeForm({ env, ctx, jar, clientId });
	const approveStep = await submitApproveForm({
		env,
		ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
	});
	const passkeyEnrollHtml = await approveStep.response.text();
	const skipStep = await followPasskeySkipToTotp({
		env,
		ctx,
		jar: approveStep.jar,
		passkeyEnrollHtml,
	});
	const enrollNonce = extractHiddenInputValue(skipStep.totpPageHtml, "enroll_nonce");
	const csrfToken = extractHiddenInputValue(skipStep.totpPageHtml, "csrf_token");
	const secret = extractSecretDisplay(skipStep.totpPageHtml);
	return {
		jar: skipStep.jar,
		totpPageHtml: skipStep.totpPageHtml,
		enrollNonce,
		csrfToken,
		secret,
	};
}

export async function buildTotpCode(secret) {
	return await generateTotpCode(secret);
}
