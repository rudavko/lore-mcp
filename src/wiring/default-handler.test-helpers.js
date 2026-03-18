/** @implements FR-001 — Shared grouped dependency fixtures for default-handler tests. */
import {
	bodyString,
	byteValuesToHexString,
	failKey,
	FAIL_WINDOW_TTL_SECONDS,
	isLockoutReached,
	lockKey,
	LOCKOUT_TTL_SECONDS,
	nextFailCount,
} from "../lib/auth-helpers.pure.js";
import {
	buildStoredCredentialData,
	challengeKey,
	CHALLENGE_TTL_SECONDS,
	parseStoredCredentialData,
	PASSKEY_CRED_KEY,
} from "../webauthn.pure.js";
import {
	base32Decode,
	base32Encode,
	buildOtpAuthUri,
	computeTimeCounter,
	counterToBytes,
	extractHotpCode,
	validateTotpFormat,
} from "../totp.pure.js";
export { readSetCookies } from "../test-helpers/http-cookies.test.js";
export { createMemoryKv } from "../test-helpers/http-kv-context.test.js";

export const RequestCtor = globalThis.Request;
export const ResponseCtor = globalThis.Response;
export const HeadersCtor = globalThis.Headers;
export const URLCtor = globalThis.URL;
export const Uint8ArrayCtor = globalThis.Uint8Array;

function createQrCodeCtor() {
	return () => ({ svg: () => "<svg></svg>" });
}

function mergeGroup(base, override) {
	return {
		...base,
		...(override || {}),
	};
}

export function createDefaultHandlerDeps(overrides = {}) {
	const routeRegistration = mergeGroup(
		{
			registerAuthRoutes: () => {},
			registerAdminRoutes: () => {},
		},
		overrides.routeRegistration,
	);
	const platform = mergeGroup(
		{
			bodyString,
			byteValuesToHexString,
			cryptoLike: globalThis.crypto,
			urlCtor: URLCtor,
			headersCtor: HeadersCtor,
			responseCtor: ResponseCtor,
			textEncoderCtor: TextEncoder,
			textDecoderCtor: TextDecoder,
			uint8ArrayCtor: Uint8ArrayCtor,
			jsonParse: JSON.parse,
			jsonStringify: JSON.stringify,
			atob: globalThis.atob,
			btoa: globalThis.btoa,
			stringFromCharCode: String.fromCharCode,
			encodeUriComponent: globalThis.encodeURIComponent,
			decodeUriComponent: globalThis.decodeURIComponent,
			nowMs: Date.now,
			floor: Math.floor,
			numberIsFinite: Number.isFinite,
			arrayFrom: Array.from,
			arrayIsArray: Array.isArray,
			mapCtor: Map,
			typeErrorCtor: TypeError,
		},
		overrides.platform,
	);
	const authState = mergeGroup(
		{
			failKey,
			lockKey,
			nextFailCount,
			isLockoutReached,
			failWindowTtlSeconds: FAIL_WINDOW_TTL_SECONDS,
			lockoutTtlSeconds: LOCKOUT_TTL_SECONDS,
			passkeyCredentialKey: PASSKEY_CRED_KEY,
			challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
			challengeKey,
			kvGet: async (kv, key) => await kv.get(key),
			kvPut: async (kv, key, value) => await kv.put(key, value),
			kvPutTtl: async (kv, key, value, ttl) => await kv.put(key, value, { expirationTtl: ttl }),
			kvDelete: async (kv, key) => await kv.delete(key),
		},
		overrides.authState,
	);
	const webauthn = mergeGroup(
		{
			buildStoredCredentialData,
			parseStoredCredentialData,
			generateRegistrationOptions: async () => ({}),
			verifyRegistrationResponse: async () => ({ verified: false }),
			generateAuthenticationOptions: async () => ({}),
			verifyAuthenticationResponse: async () => ({
				verified: false,
				authenticationInfo: { newCounter: 0 },
			}),
		},
		overrides.webauthn,
	);
	const otp = mergeGroup(
		{
			base32Encode,
			base32Decode,
			validateTotpFormat,
			counterToBytes,
			computeTimeCounter,
			extractHotpCode,
			buildOtpAuthUri,
		},
		overrides.otp,
	);
	const ui = mergeGroup(
		{
			renderAuthPage: () => "",
			renderEnrollPasskeyPage: () => "",
			renderEnrollTotpPage: () => "",
			renderInstallWorkflowPage: () => "",
			qrCodeCtor: createQrCodeCtor(),
		},
		overrides.ui,
	);
	const admin = mergeGroup(
		{
			installWorkflowToRepo: async () => ({}),
			normalizeRepoFullName: () => null,
			readAutoUpdatesSetupToken: async () => null,
		},
		overrides.admin,
	);
	return {
		routeRegistration,
		platform,
		authState,
		webauthn,
		otp,
		ui,
		admin,
	};
}
