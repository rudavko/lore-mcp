/** @implements FR-018, FR-011 — Shared harness for extracted auth route handler tests. */
import { createAuthRouteHandlers } from "./auth-route-handlers.orch.2.js";
import { safeStringEqual as compareStrings } from "./lib/constant-time-equal.pure.js";
import { renderAuthPage } from "./templates/auth-page.pure.js";
import { renderEnrollPasskeyPage } from "./templates/enroll-passkey.pure.js";
import { renderEnrollTotpPage } from "./templates/enroll-totp.pure.js";

export function createAuthRouteHarness(overrides = {}) {
	const cookies = new Map();
	const kvValues = new Map();
	const kvWrites = [];
	const challengeMap = new Map();
	let body = {};
	let query = {};
	let nonceCounter = 0;
	const defaultRandomToken = () => {
		nonceCounter += 1;
		return `token-${nonceCounter}`;
	};
	const deps = {
		kvGet: async (key) => (kvValues.has(key) ? kvValues.get(key) : null),
		kvPut: async (key, value) => {
			kvWrites.push({ key, value });
			kvValues.set(key, value);
		},
		kvDelete: async (key) => {
			kvValues.delete(key);
		},
		getCookie: (name) => cookies.get(name) || "",
		setCookie: (name, value) => {
			cookies.set(name, value);
		},
		deleteCookie: (name) => {
			cookies.delete(name);
		},
		randomToken: defaultRandomToken,
		safeStringEqual: async (left, right) =>
			compareStrings(left, right, {
				textEncoderCtor: TextEncoder,
			}),
		bodyString: (value) => (typeof value === "string" ? value : ""),
		getClientIp: () => "127.0.0.1",
		isIpLocked: async () => false,
		registerAuthFailure: async () => undefined,
		clearAuthFailures: async () => undefined,
		accessPassphrase: "test-pass",
		parseBody: async () => body,
		queryParam: (name) => query[name] || "",
		getRequestUrl: () => "https://lore.example.com/authorize?client_id=test-client",
		parseUrl: (value) => new URL(value),
		htmlResponse: (payload, status = 200) => ({ status, body: payload, kind: "html" }),
		textResponse: (payload, status = 200) => ({ status, body: payload, kind: "text" }),
		redirectResponse: (location) => ({ status: 302, location, kind: "redirect" }),
		setCspNonce: (_nonce) => undefined,
		parseAuthRequest: async () => ({
			responseType: "code",
			clientId: "test-client",
			redirectUri: "https://client.example/callback",
			scope: ["read", "write"],
		}),
		lookupClient: async () => ({ clientName: "Test Client", clientUri: "https://client.example" }),
		completeAuthorization: async () => "https://client.example/callback?code=ok",
		getCredential: async () => null,
		storeCredential: async () => undefined,
		updateCredentialCounter: async () => undefined,
		createRegistrationOptions: async () => ({ challenge: "reg-challenge" }),
		verifyRegistration: async () => ({ id: "cred-1", publicKey: "pk-1" }),
		createAuthenticationOptions: async () => ({ challenge: "auth-challenge" }),
		verifyAuthentication: async () => ({ verified: false, newCounter: 0 }),
		storeChallenge: async (nonce, record) => {
			challengeMap.set(nonce, record);
		},
		consumeChallenge: async (nonce) => {
			const value = challengeMap.get(nonce) || null;
			challengeMap.delete(nonce);
			return value;
		},
		generateSecret: () => "ABCDEFGHIJKLMNOP",
		verifyTOTP: async (_secret, code) => code === "123456",
		buildOtpAuthUri: ({ secret }) => `otpauth://totp/${secret}`,
		generateQrSvg: (uri) => `<svg data-uri="${uri}"></svg>`,
		formatSecretForDisplay: (secret) => secret,
		jsonStringify: JSON.stringify,
		jsonParse: JSON.parse,
		renderAuthPage,
		renderEnrollPasskeyPage,
		renderEnrollTotpPage,
		startPasskeyEnrollment: async (_oauthReq, _totpEnrolled) => ({
			status: 200,
			body: "passkey-enroll",
			kind: "html",
		}),
		...overrides,
	};
	return {
		deps,
		cookies,
		kvValues,
		kvWrites,
		challengeMap,
		setBody: (next) => {
			body = next;
		},
		setQuery: (next) => {
			query = next;
		},
		createHandlers: () => createAuthRouteHandlers(deps),
	};
}
