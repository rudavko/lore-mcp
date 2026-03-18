/** @implements FR-011 — Shared exported-worker auth E2E environment helpers. */
import worker from "./index.js";
import { PASSKEY_CRED_KEY } from "./webauthn.pure.js";
import { base32Decode, computeTimeCounter, counterToBytes, extractHotpCode } from "./totp.pure.js";
import {
	applySetCookies,
	buildCookieHeader,
} from "./test-helpers/http-cookies.test.js";
import {
	extractHiddenInputValue,
	extractHref,
	extractSecretDisplay,
} from "./test-helpers/html-scrape.test.js";
export {
	createCtx,
	createMemoryKv,
} from "./test-helpers/http-kv-context.test.js";
export {
	extractHiddenInputValue,
	extractHref,
	extractSecretDisplay,
} from "./test-helpers/html-scrape.test.js";

const RequestCtor = globalThis.Request;
const ResponseCtor = globalThis.Response;
const URLCtor = globalThis.URL;
const HeadersCtor = globalThis.Headers;
const Uint8ArrayCtor = globalThis.Uint8Array;

function URLPatternPolyfill(pattern) {
	return {
		pathname: pattern.pathname,
		test: (value) => {
			const url = typeof value === "string" ? new URLCtor(value) : value;
			return url.pathname === pattern.pathname;
		},
	};
}

if (typeof globalThis.URLPattern === "undefined") {
	globalThis.URLPattern = URLPatternPolyfill;
}

export const AUTH_MARKER = "Authorize access to your knowledge store";
export const REDIRECT_URI = "http://localhost/callback";
export const ACCESS_PASSPHRASE = "test-pass";
export { PASSKEY_CRED_KEY };
export const VALID_PASSKEY_CREDENTIAL = {
	id: "cred-1",
	publicKey:
		"pQECAyYgASFYINBBnATf5b1HEZbNTp0BYe5XaTkKqMu82ZftBIqptvFdIlggtwaxy5-rB1lxeBJSqCSbO_VlMi7gqQTF9CaDoc3KOh4",
	counter: 0,
	transports: ["internal"],
};

export function createMcpBindingStub() {
	return {
		newUniqueId: () => ({ toString: () => "stub-session" }),
		idFromName: (_name) => ({ id: "stub-id" }),
	};
}

export function createClientLookupFailingKv(base) {
	return {
		...base,
		get: async (key, options) => {
			if (key.startsWith("client:")) {
				return Promise.reject(new Error("simulated client lookup failure"));
			}
			return await base.get(key, options);
		},
	};
}

export async function workerFetch(env, ctx, path, init) {
	const request = new RequestCtor(`http://localhost${path}`, init);
	return await worker.fetch(request, env, ctx);
}

export async function workerFetchWithCookies({ env, ctx, jar, path, init }) {
	const headers = new HeadersCtor(init?.headers || undefined);
	const cookieHeader = buildCookieHeader(jar);
	if (cookieHeader.length > 0) {
		headers.set("cookie", cookieHeader);
	}
	const response = await workerFetch(env, ctx, path, {
		...(init || {}),
		headers,
	});
	const updatedJar = applySetCookies(jar, response);
	return { response, jar: updatedJar };
}

export async function registerClient(env, ctx) {
	const response = await workerFetch(env, ctx, "/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_name: "Lore E2E Client",
			redirect_uris: [REDIRECT_URI],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});
	return await response.json();
}

export function buildAuthorizePath(clientId, options) {
	const url = new URLCtor("http://localhost/authorize");
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", REDIRECT_URI);
	url.searchParams.set("scope", "read write");
	url.searchParams.set("state", options?.state || "e2e-state");
	if (options?.fallback) {
		url.searchParams.set("fallback", "1");
	}
	return `${url.pathname}${url.search}`;
}

export function extractAuthorizationCode(location) {
	const url = new URLCtor(location);
	return {
		code: url.searchParams.get("code"),
		state: url.searchParams.get("state"),
	};
}

export async function exchangeCodeForToken(env, ctx, clientId, code) {
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
	});
	const response = await workerFetch(env, ctx, "/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	return await response.json();
}

export async function generateTotpCode(secret, nowMs = Date.now()) {
	const decoded = base32Decode(secret);
	if (!decoded.ok) {
		return "000000";
	}
	const nowSeconds = Math.floor(nowMs / 1000);
	const counter = computeTimeCounter(nowSeconds, 30);
	const key = await crypto.subtle.importKey(
		"raw",
		new Uint8ArrayCtor(decoded.bytes),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new Uint8ArrayCtor(counterToBytes(counter)),
	);
	return extractHotpCode(Array.from(new Uint8ArrayCtor(signature)));
}

export async function seedPasskeyCredential(env) {
	await env.OAUTH_KV.put(PASSKEY_CRED_KEY, JSON.stringify(VALID_PASSKEY_CREDENTIAL));
}

export const testGlobals = {
	ResponseCtor,
};
