import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import {
	decodeBase64Url,
	parseJwt,
	fetchJwkSet,
	verifyCfAccessJwt,
} from "./cf-access";

// --- Test helpers ---

const TEAM_DOMAIN = "testteam";
const AUD = "test-aud-tag-abc123";
const ISS = `https://${TEAM_DOMAIN}.cloudflareaccess.com`;

let rsaKeyPair: CryptoKeyPair;
let rsaPublicJwk: JsonWebKey & { kid: string };

beforeAll(async () => {
	rsaKeyPair = await crypto.subtle.generateKey(
		{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
		true,
		["sign", "verify"],
	);
	const exported = await crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);
	rsaPublicJwk = { ...exported, kid: "test-kid-1" };
});

function base64UrlEncode(data: Uint8Array | string): string {
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
	const binary = String.fromCharCode(...bytes);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createSignedJwt(
	payload: Record<string, unknown>,
	options?: { kid?: string; alg?: string; key?: CryptoKey },
): Promise<string> {
	const header = {
		alg: options?.alg ?? "RS256",
		typ: "JWT",
		kid: options?.kid ?? "test-kid-1",
	};

	const headerB64 = base64UrlEncode(JSON.stringify(header));
	const payloadB64 = base64UrlEncode(JSON.stringify(payload));
	const signedPart = `${headerB64}.${payloadB64}`;

	const key = options?.key ?? rsaKeyPair.privateKey;
	const signature = new Uint8Array(
		await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signedPart)),
	);
	const sigB64 = base64UrlEncode(signature);

	return `${signedPart}.${sigB64}`;
}

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
	const now = Math.floor(Date.now() / 1000);
	return {
		iss: ISS,
		aud: AUD,
		email: "owner@example.com",
		exp: now + 3600,
		iat: now,
		sub: "user-id-123",
		...overrides,
	};
}

// --- Mock KV ---

function createMockKV(): KVNamespace {
	const store = new Map<string, { value: string; expireAt?: number }>();
	return {
		get: async (key: string) => {
			const entry = store.get(key);
			if (!entry) return null;
			if (entry.expireAt && Date.now() > entry.expireAt) {
				store.delete(key);
				return null;
			}
			return entry.value;
		},
		put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
			const expireAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined;
			store.set(key, { value, expireAt });
		},
		delete: async (key: string) => { store.delete(key); },
		list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
		getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
	} as unknown as KVNamespace;
}

// --- Mock fetch ---

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
	globalThis.fetch = (input: RequestInfo | URL, _init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		return Promise.resolve(handler(url));
	};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});


// ========== decodeBase64Url ==========

describe("decodeBase64Url", () => {
	test("decodes standard base64url", () => {
		const input = base64UrlEncode("hello world");
		const result = new TextDecoder().decode(decodeBase64Url(input));
		expect(result).toBe("hello world");
	});

	test("handles url-safe characters (+ and /)", () => {
		// Bytes that produce + and / in standard base64
		const bytes = new Uint8Array([251, 239, 190]); // produces ++++ in base64
		const encoded = base64UrlEncode(bytes);
		expect(encoded).not.toContain("+");
		expect(encoded).not.toContain("/");
		const decoded = decodeBase64Url(encoded);
		expect(decoded).toEqual(bytes);
	});

	test("handles no-padding input", () => {
		// "a" encodes to "YQ" (no padding in base64url)
		const result = new TextDecoder().decode(decodeBase64Url("YQ"));
		expect(result).toBe("a");
	});

	test("handles empty input", () => {
		const result = decodeBase64Url("");
		expect(result).toEqual(new Uint8Array(0));
	});
});


// ========== parseJwt ==========

describe("parseJwt", () => {
	test("parses valid JWT", async () => {
		const token = await createSignedJwt(validPayload());
		const parsed = parseJwt(token);
		expect(parsed.header.alg).toBe("RS256");
		expect(parsed.header.kid).toBe("test-kid-1");
		expect(parsed.payload.email).toBe("owner@example.com");
		expect(parsed.signatureBytes.length).toBeGreaterThan(0);
	});

	test("throws on 2-part token", () => {
		expect(() => parseJwt("a.b")).toThrow("expected 3 parts, got 2");
	});

	test("throws on 4-part token", () => {
		expect(() => parseJwt("a.b.c.d")).toThrow("expected 3 parts, got 4");
	});

	test("throws on invalid header base64", () => {
		expect(() => parseJwt("!!!.YQ.YQ")).toThrow("invalid header");
	});
});


// ========== fetchJwkSet ==========

describe("fetchJwkSet", () => {
	test("returns cached keys on cache hit", async () => {
		const kv = createMockKV();
		const keys = [rsaPublicJwk];
		await kv.put(`ks:cfaccess:jwks:${TEAM_DOMAIN}`, JSON.stringify(keys));

		let fetchCalled = false;
		mockFetch(() => { fetchCalled = true; return new Response("", { status: 500 }); });

		const result = await fetchJwkSet(TEAM_DOMAIN, kv);
		expect(result).toEqual(keys);
		expect(fetchCalled).toBe(false);
	});

	test("fetches and caches on cache miss", async () => {
		const kv = createMockKV();
		const keys = [rsaPublicJwk];
		mockFetch(() => new Response(JSON.stringify({ keys })));

		const result = await fetchJwkSet(TEAM_DOMAIN, kv);
		expect(result).toEqual(keys);

		// Should now be cached
		const cached = await kv.get(`ks:cfaccess:jwks:${TEAM_DOMAIN}`);
		expect(cached).not.toBeNull();
	});

	test("uses negative cache on repeated failure", async () => {
		const kv = createMockKV();
		let fetchCount = 0;
		mockFetch(() => { fetchCount++; return new Response("", { status: 500 }); });

		await expect(fetchJwkSet(TEAM_DOMAIN, kv)).rejects.toThrow("jwk_fetch_failed");
		expect(fetchCount).toBe(1);

		// Second call should hit negative cache, not fetch again
		await expect(fetchJwkSet(TEAM_DOMAIN, kv)).rejects.toThrow("jwk_fetch_failed");
		expect(fetchCount).toBe(1);
	});

	test("throws on network error", async () => {
		const kv = createMockKV();
		mockFetch(() => { throw new Error("network down"); });

		await expect(fetchJwkSet(TEAM_DOMAIN, kv)).rejects.toThrow("jwk_fetch_failed");
	});

	test("throws on malformed response (no keys array)", async () => {
		const kv = createMockKV();
		mockFetch(() => new Response(JSON.stringify({ nokeys: true })));

		await expect(fetchJwkSet(TEAM_DOMAIN, kv)).rejects.toThrow("jwk_fetch_failed");
	});
});


// ========== verifyCfAccessJwt ==========

describe("verifyCfAccessJwt", () => {
	function kvWithKeys(): KVNamespace {
		const kv = createMockKV();
		// Pre-populate cache so we don't need fetch mocking
		kv.put(`ks:cfaccess:jwks:${TEAM_DOMAIN}`, JSON.stringify([rsaPublicJwk]));
		return kv;
	}

	test("happy path — valid token", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload());
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: true, email: "owner@example.com" });
	});

	test("rejects expired token", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload({ exp: Math.floor(Date.now() / 1000) - 120 }));
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "token_expired" });
	});

	test("rejects wrong audience", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload({ aud: "wrong-aud" }));
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "invalid_audience" });
	});

	test("rejects wrong issuer", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload({ iss: "https://evil.cloudflareaccess.com" }));
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "invalid_issuer" });
	});

	test("rejects missing email", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload({ email: undefined }));
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "missing_email" });
	});

	test("rejects wrong kid", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload(), { kid: "nonexistent-kid" });
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "kid_not_found" });
	});

	test("rejects tampered payload", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload());
		const parts = token.split(".");
		// Tamper with payload
		const tampered = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
		tampered.email = "evil@example.com";
		parts[1] = base64UrlEncode(JSON.stringify(tampered));
		const tamperedToken = parts.join(".");

		const result = await verifyCfAccessJwt(tamperedToken, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "invalid_signature" });
	});

	test("rejects non-RS256 algorithm", async () => {
		const kv = kvWithKeys();
		// Create a token with HS256 header (but RS256 signature — doesn't matter, alg check comes first)
		const token = await createSignedJwt(validPayload(), { alg: "HS256" });
		// Manually patch the header to say HS256
		const parts = token.split(".");
		const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
		header.alg = "HS256";
		parts[0] = base64UrlEncode(JSON.stringify(header));
		const patchedToken = parts.join(".");

		const result = await verifyCfAccessJwt(patchedToken, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "unsupported_alg" });
	});

	test("rejects malformed JWT", async () => {
		const kv = kvWithKeys();
		const result = await verifyCfAccessJwt("not.a.valid-jwt!!!", TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "malformed_jwt" });
	});

	test("accepts audience as array", async () => {
		const kv = kvWithKeys();
		const token = await createSignedJwt(validPayload({ aud: ["other-aud", AUD] }));
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: true, email: "owner@example.com" });
	});

	test("returns jwk_fetch_failed on fetch error", async () => {
		const kv = createMockKV(); // No cached keys
		mockFetch(() => new Response("", { status: 500 }));

		const token = await createSignedJwt(validPayload());
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "jwk_fetch_failed" });
	});

	test("rejects token signed with different key", async () => {
		const kv = kvWithKeys();
		const otherKeyPair = await crypto.subtle.generateKey(
			{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
			true,
			["sign", "verify"],
		);
		const token = await createSignedJwt(validPayload(), { key: otherKeyPair.privateKey });
		const result = await verifyCfAccessJwt(token, TEAM_DOMAIN, AUD, kv);
		expect(result).toEqual({ valid: false, reason: "invalid_signature" });
	});
});
