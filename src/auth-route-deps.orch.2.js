/** @implements FR-018 — Normalize auth-route dependencies and route registration. */
import { startPasskeyEnrollment } from "./auth-route-common.orch.3.js";

function createPasskeyEnrollmentDeps(deps) {
	return {
		getRequestUrl: deps.getRequestUrl,
		parseUrl: deps.parseUrl,
		getCredential: deps.getCredential,
		createRegistrationOptions: deps.createRegistrationOptions,
		randomToken: deps.randomToken,
		storeChallenge: deps.storeChallenge,
		setCookie: deps.setCookie,
		setCspNonce: deps.setCspNonce,
		htmlResponse: deps.htmlResponse,
		renderEnrollPasskeyPage: deps.renderEnrollPasskeyPage,
		jsonStringify: deps.jsonStringify,
	};
}

export function createAuthRouteDeps(deps) {
	return {
		...deps,
		startPasskeyEnrollment: (flowState) =>
			startPasskeyEnrollment(createPasskeyEnrollmentDeps(deps), flowState),
	};
}

export function registerAuthRouteTable(router, handlers) {
	router.get("/", handlers.handleRoot);
	router.get("/authorize", handlers.handleAuthorize);
	router.post("/approve", handlers.handleApprove);
	router.post("/enroll-passkey", handlers.handleEnrollPasskey);
	router.post("/complete-passkey-skip", handlers.handleCompletePasskeySkip);
	router.post("/enroll-totp-redirect", handlers.handleEnrollTotpRedirect);
	router.post("/enroll-totp", handlers.handleEnrollTotp);
}
