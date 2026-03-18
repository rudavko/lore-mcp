/** @implements FR-011 — Build auth-route dependencies from request-local default-handler context. */
function createDefaultHandlerAuthRouteDeps(ctx) {
	const platform = ctx.config.platform;
	const authState = ctx.config.authState;
	const webauthn = ctx.config.webauthn;
	const otp = ctx.config.otp;
	const ui = ctx.config.ui;
	const oauthApi = ctx.envRec.OAUTH_PROVIDER || {};
	const accessPassphrase =
		typeof ctx.envRec.ACCESS_PASSPHRASE === "string" ? ctx.envRec.ACCESS_PASSPHRASE : "";
	const kv = ctx.envRec.OAUTH_KV;

	const authDependencyError = (message, cause) => {
		const error = new Error(message);
		error.name = "AuthDependencyError";
		if (cause !== undefined) {
			error.cause = cause;
		}
		return error;
	};

	const ensureParsedRecord = (raw, label) => {
		let parsed;
		try {
			parsed = platform.jsonParse(raw);
		} catch (cause) {
			throw authDependencyError(`${label} contains invalid JSON.`, cause);
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			platform.arrayIsArray(parsed)
		) {
			throw authDependencyError(`${label} must decode to an object.`);
		}
		return parsed;
	};

	const parseAuthRequest = async () => {
		if (oauthApi.parseAuthRequest) {
			return await oauthApi.parseAuthRequest(ctx.request);
		}
		const scopeRaw = ctx.http.queryParam("scope");
		const scope = [];
		if (scopeRaw) {
			const parts = scopeRaw.split(" ");
			for (let i = 0; i < parts.length; i++) {
				const token = parts[i].trim();
				if (token.length > 0) {
					scope.push(token);
				}
			}
		}
		return {
			responseType: ctx.http.queryParam("response_type") || "code",
			clientId: ctx.http.queryParam("client_id"),
			redirectUri: ctx.http.queryParam("redirect_uri"),
			scope,
			state: ctx.http.queryParam("state") || undefined,
			codeChallenge: ctx.http.queryParam("code_challenge") || undefined,
			codeChallengeMethod: ctx.http.queryParam("code_challenge_method") || undefined,
			resource: ctx.http.queryParam("resource") || undefined,
		};
	};

	const lookupClient = async (clientId) => {
		if (!oauthApi.lookupClient) {
			throw authDependencyError("OAuth client lookup is unavailable.");
		}
		try {
			return await oauthApi.lookupClient(clientId);
		} catch (cause) {
			throw authDependencyError("OAuth client lookup failed.", cause);
		}
	};

	const completeAuthorization = async (oauthReq) => {
		if (!oauthApi.completeAuthorization) {
			throw authDependencyError("OAuth authorization completion is unavailable.");
		}
		const scope = platform.arrayIsArray(oauthReq.scope) ? oauthReq.scope : [];
		let result;
		try {
			result = await oauthApi.completeAuthorization({
				request: oauthReq,
				userId: "owner",
				scope,
				props: {},
				metadata: { source: "lore" },
			});
		} catch (cause) {
			throw authDependencyError("OAuth authorization completion failed.", cause);
		}
		if (
			!result ||
			typeof result !== "object" ||
			typeof result.redirectTo !== "string" ||
			result.redirectTo.length === 0
		) {
			throw authDependencyError("OAuth authorization completion returned no redirect.");
		}
		return result.redirectTo;
	};

	const getCredential = async () => {
		const raw = await authState.kvGet(kv, authState.passkeyCredentialKey);
		if (!raw) {
			return null;
		}
		return ensureParsedRecord(raw, "Stored passkey credential");
	};

	const storeCredential = async (credential) => {
		await authState.kvPut(kv, authState.passkeyCredentialKey, platform.jsonStringify(credential));
	};

	const updateCredentialCounter = async (counter) => {
		const current = await getCredential();
		if (!current) {
			return;
		}
		await authState.kvPut(
			kv,
			authState.passkeyCredentialKey,
			platform.jsonStringify({ ...current, counter }),
		);
	};

	const createRegistrationOptions = async (hostname, rpName, existing) => {
		const userId = new platform.uint8ArrayCtor(16);
		platform.cryptoLike.getRandomValues(userId);
		const excludeCredentials = [];
		if (existing && typeof existing.id === "string") {
			excludeCredentials.push({
				id: existing.id,
				transports: platform.arrayIsArray(existing.transports)
					? existing.transports
					: undefined,
			});
		}
		return await webauthn.generateRegistrationOptions({
			rpID: hostname,
			rpName,
			userName: "owner",
			userID: userId,
			attestationType: "none",
			excludeCredentials,
			authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
		});
	};

	const verifyRegistration = async (response, challenge, origin, hostname) => {
		const verification = await webauthn.verifyRegistrationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: origin,
			expectedRPID: hostname,
			requireUserVerification: false,
		});
		const registrationInfo =
			verification.verified === true &&
			verification.registrationInfo &&
			typeof verification.registrationInfo === "object"
				? verification.registrationInfo
				: null;
		const cred =
			registrationInfo &&
			registrationInfo.credential &&
			typeof registrationInfo.credential === "object"
				? registrationInfo.credential
				: null;
		if (cred === null) {
			return null;
		}
		return webauthn.buildStoredCredentialData(
			cred.id,
			platform.arrayFrom(new platform.uint8ArrayCtor(cred.publicKey)),
			cred.counter,
			platform.arrayIsArray(cred.transports) ? cred.transports : undefined,
		);
	};

	const createAuthenticationOptions = async (hostname, credential) => {
		const parsed = webauthn.parseStoredCredentialData(credential);
		if (!parsed) {
			return {};
		}
		return await webauthn.generateAuthenticationOptions({
			rpID: hostname,
			allowCredentials: [{ id: parsed.id, transports: parsed.transports }],
			userVerification: "preferred",
		});
	};

	const verifyAuthentication = async (input) => {
		const parsed = webauthn.parseStoredCredentialData(input.credential);
		if (!parsed) {
			return { verified: false, newCounter: 0 };
		}
		const verification = await webauthn.verifyAuthenticationResponse({
			response: input.response,
			expectedChallenge: input.challenge,
			expectedOrigin: input.origin,
			expectedRPID: input.hostname,
			requireUserVerification: false,
			credential: {
				id: parsed.id,
				publicKey: new platform.uint8ArrayCtor(parsed.publicKeyBytes),
				counter: parsed.counter,
				transports: parsed.transports,
			},
		});
		const authenticationInfo =
			verification.verified === true &&
			verification.authenticationInfo &&
			typeof verification.authenticationInfo === "object"
				? verification.authenticationInfo
				: null;
		if (!authenticationInfo || typeof authenticationInfo.newCounter !== "number") {
			return { verified: false, newCounter: parsed.counter };
		}
		return { verified: true, newCounter: authenticationInfo.newCounter };
	};

	const storeChallenge = async (nonce, challenge, oauthReq, type) => {
		await authState.kvPutTtl(
			kv,
			authState.challengeKey(nonce),
			platform.jsonStringify({ challenge, oauthReq, type }),
			authState.challengeTtlSeconds,
		);
	};

	const consumeChallenge = async (nonce) => {
		const key = authState.challengeKey(nonce);
		const raw = await authState.kvGet(kv, key);
		await authState.kvDelete(kv, key);
		if (!raw) {
			return null;
		}
		return ensureParsedRecord(raw, "Stored auth challenge");
	};

	const generateSecret = () => {
		const bytes = new platform.uint8ArrayCtor(20);
		platform.cryptoLike.getRandomValues(bytes);
		return otp.base32Encode(platform.arrayFrom(bytes));
	};

	return {
		kvGet: (key) => authState.kvGet(kv, key),
		kvPut: async (key, value, ttl) => {
			if (typeof ttl === "number") {
				await authState.kvPutTtl(kv, key, value, ttl);
			} else {
				await authState.kvPut(kv, key, value);
			}
		},
		kvDelete: (key) => authState.kvDelete(kv, key),
		getCookie: ctx.http.getCookie,
		setCookie: ctx.http.setCookie,
		deleteCookie: ctx.http.deleteCookie,
		randomToken: ctx.helpers.randomTokenHex,
		safeStringEqual: ctx.helpers.safeStringEqual,
		bodyString: platform.bodyString,
		getClientIp: ctx.http.getClientIp,
		isIpLocked: ctx.http.isIpLocked,
		registerAuthFailure: ctx.http.registerAuthFailure,
		clearAuthFailures: ctx.http.clearAuthFailures,
		accessPassphrase,
		parseBody: ctx.http.parseBody,
		queryParam: ctx.http.queryParam,
		getRequestUrl: ctx.http.getRequestUrl,
		parseUrl: ctx.http.parseUrl,
		htmlResponse: ctx.http.htmlResponse,
		textResponse: ctx.http.textResponse,
		redirectResponse: ctx.http.redirectResponse,
		setCspNonce: ctx.http.setCspNonce,
		parseAuthRequest,
		lookupClient,
		completeAuthorization,
		getCredential,
		storeCredential,
		updateCredentialCounter,
		createRegistrationOptions,
		verifyRegistration,
		createAuthenticationOptions,
		verifyAuthentication,
		storeChallenge,
		consumeChallenge,
		generateSecret,
		verifyTOTP: ctx.helpers.verifyTotp,
		buildOtpAuthUri: (opts) =>
			otp.buildOtpAuthUri(typeof opts.secret === "string" ? opts.secret : "", "Lore", "owner"),
		generateQrSvg: (uri) => new ui.qrCodeCtor({ content: uri }).svg(),
		formatSecretForDisplay: ctx.helpers.formatSecretForDisplay,
		jsonStringify: platform.jsonStringify,
		jsonParse: platform.jsonParse,
		renderAuthPage: ui.renderAuthPage,
		renderEnrollPasskeyPage: ui.renderEnrollPasskeyPage,
		renderEnrollTotpPage: ui.renderEnrollTotpPage,
	};
}

export { createDefaultHandlerAuthRouteDeps };
