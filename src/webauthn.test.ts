import { describe, test, expect, beforeEach } from "bun:test";
import {
	getCredential,
	storeCredential,
	updateCredentialCounter,
	storeChallenge,
	consumeChallenge,
	challengeKey,
	createRegistrationOptions,
	createAuthenticationOptions,
	verifyRegistration,
	verifyAuthentication,
	PASSKEY_CRED_KEY,
} from "./webauthn";
import type { WebAuthnCredential } from "@simplewebauthn/server";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

// ── In-memory KV mock ───────────────────────────────────────────────

function createKVMock(): KVNamespace {
	const store = new Map<string, { value: string; expireAt?: number }>();

	return {
		async get(key: string) {
			const entry = store.get(key);
			if (!entry) return null;
			if (entry.expireAt && Date.now() > entry.expireAt) {
				store.delete(key);
				return null;
			}
			return entry.value;
		},
		async put(key: string, value: string, opts?: { expirationTtl?: number }) {
			const expireAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined;
			store.set(key, { value, expireAt });
		},
		async delete(key: string) {
			store.delete(key);
		},
		async list() {
			return { keys: [], list_complete: true, cacheStatus: null };
		},
		async getWithMetadata() {
			return { value: null, metadata: null, cacheStatus: null };
		},
	} as unknown as KVNamespace;
}

// ── Test fixtures ───────────────────────────────────────────────────

const TEST_CREDENTIAL: WebAuthnCredential = {
	id: "dGVzdC1jcmVkLWlk",
	publicKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
	counter: 0,
	transports: ["internal", "hybrid"],
};

const TEST_OAUTH_REQ = {
	clientId: "test-client",
	scope: ["read", "write"],
	redirectUri: "https://example.com/callback",
} as unknown as AuthRequest;

// ── Tests ───────────────────────────────────────────────────────────

let kv: KVNamespace;

beforeEach(() => {
	kv = createKVMock();
});

describe("credential KV helpers", () => {
	test("getCredential returns null when no credential stored", async () => {
		expect(await getCredential(kv)).toBeNull();
	});

	test("storeCredential + getCredential round-trips correctly", async () => {
		await storeCredential(kv, TEST_CREDENTIAL);
		const retrieved = await getCredential(kv);

		expect(retrieved).not.toBeNull();
		expect(retrieved!.id).toBe(TEST_CREDENTIAL.id);
		expect(retrieved!.counter).toBe(0);
		expect(retrieved!.transports).toEqual(["internal", "hybrid"]);
		// Compare publicKey bytes
		expect(new Uint8Array(retrieved!.publicKey)).toEqual(TEST_CREDENTIAL.publicKey);
	});

	test("storeCredential serializes publicKey as base64url in KV", async () => {
		await storeCredential(kv, TEST_CREDENTIAL);
		const raw = await kv.get(PASSKEY_CRED_KEY);
		const parsed = JSON.parse(raw!);
		// publicKey should be a string (base64url), not an array/object
		expect(typeof parsed.publicKey).toBe("string");
		expect(parsed.publicKey).not.toContain("[");
	});

	test("updateCredentialCounter updates only the counter", async () => {
		await storeCredential(kv, TEST_CREDENTIAL);
		await updateCredentialCounter(kv, 42);

		const retrieved = await getCredential(kv);
		expect(retrieved!.counter).toBe(42);
		expect(retrieved!.id).toBe(TEST_CREDENTIAL.id);
		expect(new Uint8Array(retrieved!.publicKey)).toEqual(TEST_CREDENTIAL.publicKey);
	});

	test("updateCredentialCounter is no-op when no credential stored", async () => {
		await updateCredentialCounter(kv, 42);
		expect(await getCredential(kv)).toBeNull();
	});

	test("storeCredential overwrites existing credential", async () => {
		await storeCredential(kv, TEST_CREDENTIAL);
		const newCred: WebAuthnCredential = {
			...TEST_CREDENTIAL,
			id: "bmV3LWNyZWQtaWQ",
			counter: 5,
		};
		await storeCredential(kv, newCred);

		const retrieved = await getCredential(kv);
		expect(retrieved!.id).toBe("bmV3LWNyZWQtaWQ");
		expect(retrieved!.counter).toBe(5);
	});
});

describe("challenge KV helpers", () => {
	test("challengeKey generates correct prefix", () => {
		expect(challengeKey("abc123")).toBe("ks:passkey:challenge:abc123");
	});

	test("storeChallenge + consumeChallenge round-trips", async () => {
		await storeChallenge(kv, "nonce1", "challenge-value", TEST_OAUTH_REQ, "registration");
		const result = await consumeChallenge(kv, "nonce1");

		expect(result).not.toBeNull();
		expect(result!.challenge).toBe("challenge-value");
		expect(result!.type).toBe("registration");
		expect(result!.oauthReq.clientId).toBe("test-client");
	});

	test("consumeChallenge is single-use — second call returns null", async () => {
		await storeChallenge(kv, "nonce2", "challenge-2", TEST_OAUTH_REQ, "authentication");

		const first = await consumeChallenge(kv, "nonce2");
		expect(first).not.toBeNull();

		const second = await consumeChallenge(kv, "nonce2");
		expect(second).toBeNull();
	});

	test("consumeChallenge returns null for unknown nonce", async () => {
		expect(await consumeChallenge(kv, "nonexistent")).toBeNull();
	});

	test("storeChallenge sets TTL", async () => {
		await storeChallenge(kv, "nonce3", "ch", TEST_OAUTH_REQ, "registration");
		// Verify the entry exists (TTL hasn't expired yet in our mock)
		const result = await consumeChallenge(kv, "nonce3");
		expect(result).not.toBeNull();
	});
});

describe("createRegistrationOptions", () => {
	test("returns valid options structure", async () => {
		const options = await createRegistrationOptions("example.com", "Lore", null);

		expect(options.rp.name).toBe("Lore");
		expect(options.rp.id).toBe("example.com");
		expect(options.user.name).toBe("owner");
		expect(options.user.displayName).toBe("Owner");
		expect(typeof options.challenge).toBe("string");
		expect(options.challenge.length).toBeGreaterThan(0);
		expect(options.pubKeyCredParams.length).toBeGreaterThan(0);
	});

	test("sets attestation to none", async () => {
		const options = await createRegistrationOptions("example.com", "Lore", null);
		expect(options.attestation).toBe("none");
	});

	test("excludes existing credential when provided", async () => {
		const options = await createRegistrationOptions("example.com", "Lore", TEST_CREDENTIAL);
		expect(options.excludeCredentials).toBeDefined();
		expect(options.excludeCredentials!.length).toBe(1);
		expect(options.excludeCredentials![0].id).toBe(TEST_CREDENTIAL.id);
	});

	test("no excludeCredentials when no existing credential", async () => {
		const options = await createRegistrationOptions("example.com", "Lore", null);
		expect(options.excludeCredentials).toEqual([]);
	});
});

describe("createAuthenticationOptions", () => {
	test("returns valid options structure", async () => {
		const options = await createAuthenticationOptions("example.com", TEST_CREDENTIAL);

		expect(options.rpId).toBe("example.com");
		expect(typeof options.challenge).toBe("string");
		expect(options.challenge.length).toBeGreaterThan(0);
		expect(options.allowCredentials).toBeDefined();
		expect(options.allowCredentials!.length).toBe(1);
		expect(options.allowCredentials![0].id).toBe(TEST_CREDENTIAL.id);
	});

	test("passes transports from credential", async () => {
		const options = await createAuthenticationOptions("example.com", TEST_CREDENTIAL);
		expect(options.allowCredentials![0].transports).toEqual(["internal", "hybrid"]);
	});
});

describe("verifyRegistration", () => {
	test("returns null on invalid response", async () => {
		const result = await verifyRegistration(
			{ id: "bad", rawId: "bad", type: "public-key", response: {} as any, clientExtensionResults: {} },
			"expected-challenge",
			"https://example.com",
			"example.com",
		);
		expect(result).toBeNull();
	});

	test("returns null on empty response", async () => {
		const result = await verifyRegistration(
			{} as any,
			"expected-challenge",
			"https://example.com",
			"example.com",
		);
		expect(result).toBeNull();
	});
});

describe("verifyAuthentication", () => {
	test("returns verified:false on invalid response", async () => {
		const result = await verifyAuthentication(
			{ id: "bad", rawId: "bad", type: "public-key", response: {} as any, clientExtensionResults: {} },
			"expected-challenge",
			"https://example.com",
			"example.com",
			TEST_CREDENTIAL,
		);
		expect(result.verified).toBe(false);
		expect(result.newCounter).toBe(0);
	});

	test("returns verified:false on empty response", async () => {
		const result = await verifyAuthentication(
			{} as any,
			"expected-challenge",
			"https://example.com",
			"example.com",
			TEST_CREDENTIAL,
		);
		expect(result.verified).toBe(false);
	});
});
