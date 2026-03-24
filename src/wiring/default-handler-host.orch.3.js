/** @implements FR-001, FR-011 — Host adapter for default-handler env and request header inputs. */
function createDefaultHandlerHost(request, env) {
	const envRec = env && typeof env === "object" ? env : {};
	return {
		authKv: envRec.OAUTH_KV,
		oauthProvider: envRec.OAUTH_PROVIDER || {},
		accessPassphrase:
			typeof envRec.ACCESS_PASSPHRASE === "string" ? envRec.ACCESS_PASSPHRASE : "",
		clientIp: request.headers.get("CF-Connecting-IP") || "unknown",
	};
}

export { createDefaultHandlerHost };
