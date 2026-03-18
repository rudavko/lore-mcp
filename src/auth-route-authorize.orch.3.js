/** @implements FR-018 — Authorize route orchestration for OAuth/passkey selection. */
import {
	parseRequestContext,
	fetchEnrollmentState,
	preparePasskeyAuthData,
	persistAndRenderAuthPage,
} from "./auth-route-common.orch.3.js";

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
	const enrollState = await fetchEnrollmentState(deps.getCredential, deps.kvGet);
	const reqCtx = parseRequestContext(deps.getRequestUrl, deps.queryParam, deps.parseUrl);
	let passkeyOnly = false;
	const stored = {
		oauthReq: oauthReqInfo,
		fallbackRequested: reqCtx.fallbackRequested,
	};
	let authOptionsJSON = "";
	let cspNonce = "";
	let fallbackUrl = "";
	if (enrollState.passkeyEnrolled && !reqCtx.fallbackRequested) {
		const authData = await preparePasskeyAuthData(
			deps,
			reqCtx.url,
			enrollState.passkeyCredential,
			enrollState.totpEnrolled,
		);
		if (authData !== null) {
			passkeyOnly = true;
			stored.webauthnChallenge = authData.webauthnChallenge;
			authOptionsJSON = authData.authOptionsJSON;
			cspNonce = authData.cspNonce;
			fallbackUrl = authData.fallbackUrl;
		}
	}
	return persistAndRenderAuthPage({
		deps,
		requestNonce,
		csrfToken,
		stored,
		pageData: {
			clientName,
			clientUri,
			scopes,
			totpEnrolled: enrollState.totpEnrolled,
			passkeyEnrolled: passkeyOnly,
			passkeyOnly,
			fallbackUrl: fallbackUrl || undefined,
			authOptionsJSON: authOptionsJSON || undefined,
			cspNonce: cspNonce || undefined,
		},
	});
}
