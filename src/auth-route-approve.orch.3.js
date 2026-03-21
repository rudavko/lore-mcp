/** @implements FR-018 — Approve route orchestration for passkey/passphrase/TOTP flows. */
import {
	AUTH_ACTION_APPROVE_PASSKEY,
	AUTH_ACTION_APPROVE_PASSPHRASE,
	AUTH_ACTION_APPROVE_PASSPHRASE_TOTP,
	createPasskeyEnrollmentFlowState,
	resolvePassphraseApprovalAction,
} from "./auth-flow-state.pure.js";
import { TOTP_SECRET_KEY } from "./auth-shared.pure.js";
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

async function startPasskeyEnrollmentForFlow(deps, flowState) {
	await deps.clearAuthFailures();
	return deps.startPasskeyEnrollment(flowState);
}

function denyAuthorizationWithoutFailure(deps) {
	return deps.textResponse("Authorization failed", 403);
}

async function verifyApprovedTotpAndContinue(input) {
	if (!(await input.deps.verifyTOTP(input.enrolledTotpSecret, input.totpCode))) {
		return failAuthorization(input.deps);
	}
	if (!input.passkeyUsable) {
		return startPasskeyEnrollmentForFlow(
			input.deps,
			createPasskeyEnrollmentFlowState({
				oauthReq: input.oauthReqInfo,
				alternateFactorSatisfied: true,
				allowTotpEnrollment: false,
			}),
		);
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
	flowState,
}) {
	const passphraseAction = resolvePassphraseApprovalAction(flowState);
	if (passphraseAction === null) {
		return denyAuthorizationWithoutFailure(deps);
	}
	if (!(await deps.safeStringEqual(passphrase, accessPassphrase))) {
		return failAuthorization(deps);
	}
	switch (passphraseAction) {
		case AUTH_ACTION_APPROVE_PASSPHRASE_TOTP: {
			const enrolledTotpSecret = await deps.kvGet(TOTP_SECRET_KEY);
			if (enrolledTotpSecret === null) {
				return deps.textResponse("Authorization state changed. Retry authorization.", 400);
			}
			const passkeyCredential = await deps.getCredential();
			const passkeyUsable = await hasUsablePasskeyCredential(deps, passkeyCredential);
			return verifyApprovedTotpAndContinue({
				deps,
				enrolledTotpSecret,
				totpCode,
				oauthReqInfo,
				passkeyUsable,
			});
		}
		case AUTH_ACTION_APPROVE_PASSPHRASE:
			return startPasskeyEnrollmentForFlow(
				deps,
				createPasskeyEnrollmentFlowState({
					oauthReq: oauthReqInfo,
					alternateFactorSatisfied: false,
					allowTotpEnrollment: true,
				}),
			);
		default:
			return denyAuthorizationWithoutFailure(deps);
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
	const stored = await consumeStoredAuthRequest(
		deps,
		input.requestNonce,
		input.csrfBody,
		input.csrfCookie,
	);
	if (stored.kind === "missing") {
		return deps.textResponse("Authorization request expired. Retry authorization.", 400);
	}
	if (stored.kind === "invalid") {
		return deps.textResponse("Invalid authorization state. Retry authorization.", 400);
	}
	const flowState = stored.record.flowState;
	const oauthReqInfo = flowState.oauthReq;
	if (input.webauthnResponseRaw) {
		if (
			flowState.requiredNextAction !== AUTH_ACTION_APPROVE_PASSKEY ||
			typeof stored.record.webauthnChallenge !== "string" ||
			stored.record.webauthnChallenge.length === 0
		) {
			return deps.textResponse("Invalid authorization state. Retry authorization.", 400);
		}
		return approveViaPasskey(
			deps,
			input.webauthnResponseRaw,
			stored.record.webauthnChallenge,
			oauthReqInfo,
		);
	}
	return approveViaPassphrase({
		deps,
		passphrase: input.passphrase,
		accessPassphrase: deps.accessPassphrase,
		totpCode: input.totpCode,
		oauthReqInfo,
		flowState,
	});
}
