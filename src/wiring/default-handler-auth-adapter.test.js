/** @implements FR-011 — Verify default-handler auth adapter preserves dependency failures. */
import { describe, expect, test } from "bun:test";
import { createDefaultHandlerAuthRouteDeps } from "./default-handler-auth-adapter.orch.3.js";

function QrCodeCtor() {
	return {
		svg: () => "<svg></svg>",
	};
}

function createAuthAdapterHarness(overrides = {}) {
	const kvValues = new Map();
	const platform = {
		arrayIsArray: Array.isArray,
		uint8ArrayCtor: Uint8Array,
		cryptoLike: globalThis.crypto,
		jsonParse: JSON.parse,
		jsonStringify: JSON.stringify,
		bodyString: (value) => (typeof value === "string" ? value : ""),
		urlCtor: URL,
		...(overrides.platform || {}),
	};
	const authState = {
		passkeyCredentialKey: "ks:passkey:cred",
		challengeTtlSeconds: 300,
		challengeKey: (nonce) => `ks:challenge:${nonce}`,
		kvGet: async (_kv, key) => (kvValues.has(key) ? kvValues.get(key) : null),
		kvPut: async (_kv, key, value) => {
			kvValues.set(key, value);
		},
		kvPutTtl: async (_kv, key, value) => {
			kvValues.set(key, value);
		},
		kvDelete: async (_kv, key) => {
			kvValues.delete(key);
		},
		...(overrides.authState || {}),
	};
	const ctx = {
		config: {
			platform,
			authState,
			webauthn: {
				buildStoredCredentialData: () => ({}),
				parseStoredCredentialData: () => null,
				generateRegistrationOptions: async () => ({}),
				verifyRegistrationResponse: async () => ({ verified: false }),
				generateAuthenticationOptions: async () => ({}),
				verifyAuthenticationResponse: async () => ({
					verified: false,
					authenticationInfo: { newCounter: 0 },
				}),
				...(overrides.webauthn || {}),
			},
			otp: {
				base32Encode: () => "",
				buildOtpAuthUri: () => "",
				...(overrides.otp || {}),
			},
			ui: {
				qrCodeCtor: QrCodeCtor,
				renderAuthPage: () => "",
				renderEnrollPasskeyPage: () => "",
				renderEnrollTotpPage: () => "",
				...(overrides.ui || {}),
			},
		},
		envRec: {
			OAUTH_KV: {},
			OAUTH_PROVIDER: {},
			ACCESS_PASSPHRASE: "test-pass",
			...(overrides.envRec || {}),
		},
		http: {
			getCookie: () => "",
			setCookie: () => undefined,
			deleteCookie: () => undefined,
			parseBody: async () => ({}),
			queryParam: () => "",
			getRequestUrl: () => "https://lore.example.com/authorize",
			parseUrl: (value) => new URL(value),
			htmlResponse: (body, status = 200) => ({ body, status }),
			textResponse: (body, status = 200) => ({ body, status }),
			redirectResponse: (location) => ({ location, status: 302 }),
			setCspNonce: () => undefined,
			getClientIp: () => "127.0.0.1",
			isIpLocked: async () => false,
			registerAuthFailure: async () => undefined,
			clearAuthFailures: async () => undefined,
			...(overrides.http || {}),
		},
		helpers: {
			randomTokenHex: () => "token",
			safeStringEqual: async (left, right) => left === right,
			verifyTotp: async () => false,
			formatSecretForDisplay: (value) => value,
			...(overrides.helpers || {}),
		},
		request: new Request("https://lore.example.com/authorize"),
	};
	return {
		deps: createDefaultHandlerAuthRouteDeps(ctx),
		kvValues,
	};
}

describe("wiring/default-handler-auth-adapter", () => {
	test("lookupClient throws when the OAuth provider does not expose a client lookup hook", async () => {
		const harness = createAuthAdapterHarness();
		await expect(harness.deps.lookupClient("client-1")).rejects.toThrow(
			"OAuth client lookup is unavailable.",
		);
	});

	test("getCredential throws when stored passkey data is invalid JSON", async () => {
		const harness = createAuthAdapterHarness();
		harness.kvValues.set("ks:passkey:cred", "{bad");
		await expect(harness.deps.getCredential()).rejects.toThrow(
			"Stored passkey credential contains invalid JSON.",
		);
	});

	test("consumeChallenge throws when stored challenge data is not an object", async () => {
		const harness = createAuthAdapterHarness();
		harness.kvValues.set("ks:challenge:nonce-1", '"bad"');
		await expect(harness.deps.consumeChallenge("nonce-1")).rejects.toThrow(
			"Stored auth challenge must decode to an object.",
		);
	});
});
