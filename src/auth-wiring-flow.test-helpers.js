/** @implements FR-011 — Shared auth E2E flows over the exported worker. */
import { expect } from "bun:test";
import { TOTP_SECRET_KEY, csrfCookieNameForNonce } from "./auth-shared.pure.js";
import { PASSKEY_CRED_KEY } from "./webauthn.pure.js";
import { lockKey } from "./lib/auth-helpers.pure.js";
import {
	ACCESS_PASSPHRASE,
	extractHiddenInputValue,
	VALID_PASSKEY_CREDENTIAL,
	createCtx,
	createMcpBindingStub,
	createMemoryKv,
	registerClient,
	seedPasskeyCredential,
	workerFetch,
	workerFetchWithCookies,
} from "./auth-wiring-env.test-helpers.js";
import {
	requestAuthorizeForm,
	submitApproveForm,
	submitLockedApproveForm,
	submitTotpEnrollmentForm,
	exchangeAuthorizationLocation,
	buildTotpEnrollmentState,
	buildTotpCode,
} from "./auth-wiring-steps.test-helpers.js";

const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

export async function startTotpEnrollmentViaPasskeySkip(env, ctx, jar, clientId) {
	const totpSetup = await buildTotpEnrollmentState({
		env,
		ctx,
		jar,
		clientId,
	});
	return { jar: totpSetup.jar, totpPageHtml: totpSetup.totpPageHtml };
}

export async function createAuthTestContext() {
	const env = {
		OAUTH_KV: createMemoryKv(),
		MCP_OBJECT: createMcpBindingStub(),
		ACCESS_PASSPHRASE,
	};
	const ctx = createCtx();
	const client = await registerClient(env, ctx);
	return { env, ctx, client };
}

export async function seedPasskeyAndTotp(env) {
	await seedPasskeyCredential(env);
	await env.OAUTH_KV.put(TOTP_SECRET_KEY, TEST_TOTP_SECRET);
}

export async function requestAuthorizeWithPassphraseMode(env, ctx, clientId) {
	return await requestAuthorizeForm({ env, ctx, clientId, authMode: "passphrase" });
}

export async function requestAuthorizeSession(env, ctx, path) {
	const url = new URL(`http://localhost${path}`);
	return await requestAuthorizeForm({
		env,
		ctx,
		clientId: url.searchParams.get("client_id") || "",
		authMode: url.searchParams.get("auth_mode") || undefined,
	});
}

export async function approveAuthorizeWithTotp({ env, ctx, jar, requestNonce, csrfToken }) {
	const approval = await submitApproveForm({
		env,
		ctx,
		jar,
		requestNonce,
		csrfToken,
		totpCode: await buildTotpCode(TEST_TOTP_SECRET),
	});
	return {
		jar: approval.jar,
		response: approval.response,
		location: approval.response.headers.get("location") || "",
	};
}

export async function executeFailedApproveAttempt(env, ctx, clientId, ip) {
	const authorize = await requestAuthorizeForm({ env, ctx, clientId });
	return await submitApproveForm({
		env,
		ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
		passphrase: "wrong-passphrase",
		ip,
	});
}

export async function performLockedApproveAttempt(env, ctx, clientId, ip) {
	const authorize = await requestAuthorizeForm({ env, ctx, clientId });
	return await submitLockedApproveForm({
		env,
		ctx,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
		ip,
	});
}

export async function enrollTotpAndAuthorize(env, ctx, clientId) {
	const totpSetup = await buildTotpEnrollmentState({
		env,
		ctx,
		jar: new Map(),
		clientId,
	});
	const enrollment = await submitTotpEnrollmentForm({
		env,
		ctx,
		jar: totpSetup.jar,
		enrollNonce: totpSetup.enrollNonce,
		csrfToken: totpSetup.csrfToken,
		totpCode: await buildTotpCode(totpSetup.secret),
	});
	return {
		enrollment,
		location: enrollment.response.headers.get("location") || "",
		secret: totpSetup.secret,
	};
}

export async function runPassphraseAndTotpOAuthFlow() {
	const testContext = await createAuthTestContext();
	await seedPasskeyAndTotp(testContext.env);
	const authorize = await requestAuthorizeWithPassphraseMode(
		testContext.env,
		testContext.ctx,
		testContext.client.client_id,
	);
	const approval = await approveAuthorizeWithTotp({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
	});
	expect(approval.response.status).toBe(302);
	const { code, state, tokenResponse } = await exchangeAuthorizationLocation({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
		location: approval.location,
	});
	expect(code).toBeTruthy();
	expect(state).toBeTruthy();
	expect(typeof tokenResponse.access_token).toBe("string");
}

export async function runPassphraseModeDoesNotBypassPasskeyFlow() {
	const testContext = await createAuthTestContext();
	await testContext.env.OAUTH_KV.put(
		PASSKEY_CRED_KEY,
		JSON.stringify(VALID_PASSKEY_CREDENTIAL),
	);
	const authorize = await requestAuthorizeWithPassphraseMode(
		testContext.env,
		testContext.ctx,
		testContext.client.client_id,
	);
	expect(authorize.html).toContain("Authenticating with passkey");
	const approval = await submitApproveForm({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
		passphrase: ACCESS_PASSPHRASE,
	});
	expect(approval.response.status).toBe(403);
}

export async function runOAuthAndReturnAccessToken() {
	const testContext = await createAuthTestContext();
	await seedPasskeyAndTotp(testContext.env);
	const authorize = await requestAuthorizeWithPassphraseMode(
		testContext.env,
		testContext.ctx,
		testContext.client.client_id,
	);
	const approved = await approveAuthorizeWithTotp({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
	});
	expect(approved.response.status).toBe(302);
	const { tokenResponse } = await exchangeAuthorizationLocation({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
		location: approved.location,
	});
	return {
		...testContext,
		accessToken: tokenResponse.access_token,
		refreshToken: tokenResponse.refresh_token,
	};
}

export async function runIpLockoutScenario() {
	const testContext = await createAuthTestContext();
	const ip = "203.0.113.7";
	for (let i = 0; i < 5; i++) {
		const failed = await executeFailedApproveAttempt(
			testContext.env,
			testContext.ctx,
			testContext.client.client_id,
			ip,
		);
		expect(failed.response.status).toBe(403);
	}
	const lockStatus = await testContext.env.OAUTH_KV.get(lockKey(ip));
	expect(lockStatus).toBe("1");
	const lockedResponse = await performLockedApproveAttempt(
		testContext.env,
		testContext.ctx,
		testContext.client.client_id,
		ip,
	);
	expect(lockedResponse.status).toBe(429);
	expect(await lockedResponse.text()).toContain("Too many failed attempts");
}

export async function runPasskeySkipToTotpOAuthFlow() {
	const testContext = await createAuthTestContext();
	const { location, secret } = await enrollTotpAndAuthorize(
		testContext.env,
		testContext.ctx,
		testContext.client.client_id,
	);
	expect(secret).toBeTruthy();
	await exchangeAuthorizationLocation({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
		location,
	});
}

export async function runMismatchedAuthorizeCsrfPairFailsFlow() {
	const testContext = await createAuthTestContext();
	const firstAuthorize = await requestAuthorizeForm({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
	});
	const secondAuthorize = await requestAuthorizeForm({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
	});
	const response = await workerFetch(testContext.env, testContext.ctx, "/approve", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			cookie: `${csrfCookieNameForNonce(secondAuthorize.requestNonce)}=${secondAuthorize.csrfToken}`,
		},
		body: new URLSearchParams({
			request_nonce: firstAuthorize.requestNonce,
			csrf_token: secondAuthorize.csrfToken,
			passphrase: ACCESS_PASSPHRASE,
		}).toString(),
	});
	expect(response.status).toBe(400);
	expect(await response.text()).toContain("Invalid authorization request");
}

export async function runPasskeySkipWithoutAlternateFactorFailsFlow() {
	const testContext = await createAuthTestContext();
	const authorize = await requestAuthorizeForm({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
	});
	const approve = await submitApproveForm({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: authorize.jar,
		requestNonce: authorize.requestNonce,
		csrfToken: authorize.csrfToken,
	});
	expect(approve.response.status).toBe(200);
	const passkeyEnrollHtml = await approve.response.text();
	const response = await workerFetchWithCookies({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: approve.jar,
		path: "/complete-passkey-skip",
		init: {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				enroll_nonce: extractHiddenInputValue(passkeyEnrollHtml, "enroll_nonce"),
				csrf_token: extractHiddenInputValue(passkeyEnrollHtml, "csrf_token"),
			}).toString(),
		},
	});
	expect(response.response.status).toBe(400);
	expect(await response.response.text()).toContain("Invalid enrollment state");
}

export async function runMismatchedEnrollmentCsrfPairFailsFlow() {
	const testContext = await createAuthTestContext();
	const firstAuthorize = await requestAuthorizeForm({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
	});
	const secondAuthorize = await requestAuthorizeForm({
		env: testContext.env,
		ctx: testContext.ctx,
		clientId: testContext.client.client_id,
	});
	const firstApprove = await submitApproveForm({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: firstAuthorize.jar,
		requestNonce: firstAuthorize.requestNonce,
		csrfToken: firstAuthorize.csrfToken,
	});
	const secondApprove = await submitApproveForm({
		env: testContext.env,
		ctx: testContext.ctx,
		jar: secondAuthorize.jar,
		requestNonce: secondAuthorize.requestNonce,
		csrfToken: secondAuthorize.csrfToken,
	});
	const firstPasskeyHtml = await firstApprove.response.text();
	const secondPasskeyHtml = await secondApprove.response.text();
	const response = await workerFetch(testContext.env, testContext.ctx, "/enroll-totp-redirect", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			cookie:
				`${csrfCookieNameForNonce(extractHiddenInputValue(secondPasskeyHtml, "enroll_nonce"))}=` +
				`${extractHiddenInputValue(secondPasskeyHtml, "csrf_token")}`,
		},
		body: new URLSearchParams({
			enroll_nonce: extractHiddenInputValue(firstPasskeyHtml, "enroll_nonce"),
			csrf_token: extractHiddenInputValue(secondPasskeyHtml, "csrf_token"),
		}).toString(),
	});
	expect(response.status).toBe(400);
	expect(await response.text()).toContain("Invalid enrollment request");
}
