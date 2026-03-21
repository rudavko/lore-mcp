/** @implements FR-018 — Authorize route orchestration for OAuth/passkey selection. */
import {
	authPageMode,
	createAuthorizeFlowState,
	isPassphraseModeAvailable,
	requiresTotp,
} from "./auth-flow-state.pure.js";
import {
	parseRequestContext,
	fetchEnrollmentState,
	preparePasskeyAuthData,
	persistAndRenderAuthPage,
} from "./auth-route-common.orch.3.js";

function isAuthDependencyError(error) {
	return error instanceof Error && error.name === "AuthDependencyError";
}

export async function handleAuthorize(deps) {
	if (!deps.accessPassphrase || deps.accessPassphrase.length === 0) {
		return deps.textResponse("Server misconfigured: ACCESS_PASSPHRASE is required.", 500);
	}
	let oauthReqInfo;
	try {
		oauthReqInfo = await deps.parseAuthRequest();
	} catch {
		return deps.textResponse("Invalid authorization request", 400);
	}
	const requestNonce = deps.randomToken();
	const csrfToken = deps.randomToken();
	const oauthReq = oauthReqInfo;
	const clientInfo = await deps.lookupClient(oauthReq.clientId);
	if (clientInfo === null || typeof clientInfo !== "object") {
		return deps.textResponse("Invalid authorization request", 400);
	}
	const clientName = clientInfo.clientName || oauthReq.clientId;
	const clientUri = clientInfo.clientUri || "";
	const scopes = oauthReq.scope.length > 0 ? oauthReq.scope.join(", ") : "full access";
	let enrollState;
	try {
		enrollState = await fetchEnrollmentState(deps.getCredential, deps.kvGet);
	} catch (error) {
		if (isAuthDependencyError(error)) {
			return deps.textResponse("Invalid authorization state. Retry authorization.", 400);
		}
		throw error;
	}
	const reqCtx = parseRequestContext(deps.getRequestUrl, deps.queryParam, deps.parseUrl);
	const authData =
		enrollState.passkeyEnrolled
			? await preparePasskeyAuthData(
					deps,
					reqCtx.url,
					enrollState.passkeyCredential,
					enrollState.totpEnrolled,
				)
			: null;
	const flowState = createAuthorizeFlowState({
		oauthReq: oauthReqInfo,
		passkeyUsable: authData !== null,
		totpEnrolled: enrollState.totpEnrolled,
	});
	const renderPassphraseMode =
		reqCtx.passphraseModeRequested && isPassphraseModeAvailable(flowState);
	const passkeyOnly = authPageMode(flowState) === "passkey" && !renderPassphraseMode;
	let authOptionsJSON = "";
	let cspNonce = "";
	let passphraseModeUrl = "";
	let webauthnChallenge = "";
	if (passkeyOnly && authData !== null) {
		authOptionsJSON = authData.authOptionsJSON;
		cspNonce = authData.cspNonce;
		webauthnChallenge = authData.webauthnChallenge;
		if (isPassphraseModeAvailable(flowState)) {
			passphraseModeUrl = authData.passphraseModeUrl;
		}
	}
	return persistAndRenderAuthPage({
		deps,
		requestNonce,
		csrfToken,
		flowState,
		webauthnChallenge,
		pageData: {
			clientName,
			clientUri,
			scopes,
			totpEnrolled: renderPassphraseMode ? true : requiresTotp(flowState),
			passkeyEnrolled: passkeyOnly,
			passkeyOnly,
			passphraseModeUrl: passphraseModeUrl || undefined,
			authOptionsJSON: authOptionsJSON || undefined,
			cspNonce: cspNonce || undefined,
		},
	});
}
