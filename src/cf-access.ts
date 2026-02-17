// Cloudflare Access JWT verification using Web Crypto.
// Zero dependencies — uses only standard APIs available in Cloudflare Workers.

// GEMINI-CONTEXT: Cache keys include teamDomain to prevent cross-domain collisions.
// Single-user deploy today, but domain-scoped keys are correct by construction.
// Positive cache: 12h TTL. Negative cache: 60s to avoid hammering on transient failures.

const JWKS_TTL_SECONDS = 12 * 60 * 60; // 12h
const JWKS_NEG_TTL_SECONDS = 60; // 60s
const CLOCK_SKEW_SECONDS = 30;

function jwksCacheKey(teamDomain: string): string {
	return `ks:cfaccess:jwks:${teamDomain}`;
}

function jwksNegCacheKey(teamDomain: string): string {
	return `ks:cfaccess:jwks:neg:${teamDomain}`;
}

// Standard JsonWebKey omits kid/use — JWKS endpoints include them
interface JwksKey extends JsonWebKey {
	kid?: string;
	use?: string;
}

export interface ParsedJwt {
	header: { alg: string; kid?: string; typ?: string };
	payload: Record<string, unknown>;
	signatureBytes: Uint8Array;
	signedPart: string; // header.payload (for verification)
}

export type CfAccessResult =
	| { valid: true; email: string }
	| { valid: false; reason: string };

export function decodeBase64Url(input: string): Uint8Array {
	// Restore standard base64: replace url-safe chars, add padding
	const base64 = input
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function parseJwt(token: string): ParsedJwt {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error(`Malformed JWT: expected 3 parts, got ${parts.length}`);
	}

	let header: ParsedJwt["header"];
	let payload: Record<string, unknown>;

	try {
		header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
	} catch {
		throw new Error("Malformed JWT: invalid header");
	}

	try {
		payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
	} catch {
		throw new Error("Malformed JWT: invalid payload");
	}

	const signatureBytes = decodeBase64Url(parts[2]);
	const signedPart = `${parts[0]}.${parts[1]}`;

	return { header, payload, signatureBytes, signedPart };
}

export async function fetchJwkSet(
	teamDomain: string,
	kv: KVNamespace,
): Promise<JwksKey[]> {
	const posKey = jwksCacheKey(teamDomain);
	const negKey = jwksNegCacheKey(teamDomain);

	// Check positive cache
	const cached = await kv.get(posKey);
	if (cached) {
		return JSON.parse(cached) as JwksKey[];
	}

	// Check negative cache — avoid hammering on failure
	const negCached = await kv.get(negKey);
	if (negCached) {
		throw new Error("jwk_fetch_failed");
	}

	const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;

	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		await kv.put(negKey, "1", { expirationTtl: JWKS_NEG_TTL_SECONDS });
		throw new Error("jwk_fetch_failed");
	}

	if (!response.ok) {
		await kv.put(negKey, "1", { expirationTtl: JWKS_NEG_TTL_SECONDS });
		throw new Error("jwk_fetch_failed");
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		await kv.put(negKey, "1", { expirationTtl: JWKS_NEG_TTL_SECONDS });
		throw new Error("jwk_fetch_failed");
	}

	if (!body || typeof body !== "object" || !Array.isArray((body as { keys?: unknown }).keys)) {
		await kv.put(negKey, "1", { expirationTtl: JWKS_NEG_TTL_SECONDS });
		throw new Error("jwk_fetch_failed");
	}

	const keys = (body as { keys: JwksKey[] }).keys;
	await kv.put(posKey, JSON.stringify(keys), { expirationTtl: JWKS_TTL_SECONDS });

	return keys;
}

export async function verifyCfAccessJwt(
	token: string,
	teamDomain: string,
	expectedAud: string,
	kv: KVNamespace,
): Promise<CfAccessResult> {
	// 1. Parse
	let parsed: ParsedJwt;
	try {
		parsed = parseJwt(token);
	} catch {
		return { valid: false, reason: "malformed_jwt" };
	}

	// 2. Algorithm check
	if (parsed.header.alg !== "RS256") {
		return { valid: false, reason: "unsupported_alg" };
	}

	// 3. Fetch JWK set
	let keys: JwksKey[];
	try {
		keys = await fetchJwkSet(teamDomain, kv);
	} catch {
		return { valid: false, reason: "jwk_fetch_failed" };
	}

	// 4. Find matching kid
	const kid = parsed.header.kid;
	const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
	if (!jwk) {
		return { valid: false, reason: "kid_not_found" };
	}

	// 5. Verify signature
	let cryptoKey: CryptoKey;
	try {
		cryptoKey = await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"],
		);
	} catch {
		return { valid: false, reason: "invalid_jwk" };
	}

	const signedData = new TextEncoder().encode(parsed.signedPart);
	const valid = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		parsed.signatureBytes,
		signedData,
	);

	if (!valid) {
		return { valid: false, reason: "invalid_signature" };
	}

	// 6. Validate claims
	const { payload } = parsed;
	const now = Math.floor(Date.now() / 1000);

	// exp
	if (typeof payload.exp !== "number" || payload.exp < now - CLOCK_SKEW_SECONDS) {
		return { valid: false, reason: "token_expired" };
	}

	// iss
	const expectedIss = `https://${teamDomain}.cloudflareaccess.com`;
	if (payload.iss !== expectedIss) {
		return { valid: false, reason: "invalid_issuer" };
	}

	// aud — CF Access may send as string or array
	const aud = payload.aud;
	const audMatch =
		(typeof aud === "string" && aud === expectedAud) ||
		(Array.isArray(aud) && aud.includes(expectedAud));
	if (!audMatch) {
		return { valid: false, reason: "invalid_audience" };
	}

	// email
	const email = payload.email;
	if (typeof email !== "string" || email.length === 0) {
		return { valid: false, reason: "missing_email" };
	}

	return { valid: true, email };
}
