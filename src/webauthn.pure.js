/** @implements NFR-001 — Pure WebAuthn helpers: base64url, credential/challenge data builders. */
export const PASSKEY_CRED_KEY = "ks:passkey:cred";
export const CHALLENGE_TTL_SECONDS = 5 * 60;
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function floorDivPositive(value, divisor) {
	return (value - (value % divisor)) / divisor;
}
/** Build challenge KV key from nonce. */
export function challengeKey(nonce) {
	return `ks:passkey:challenge:${nonce}`;
}
/** Encode byte values to base64url (no padding, url-safe). */
export function base64UrlEncode(bytes) {
	let result = "";
	let i = 0;
	while (i < bytes.length) {
		const b0 = bytes[i];
		const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
		const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
		const remaining = bytes.length - i;
		result += b64UrlChar(floorDivPositive(b0, 4) % 64);
		result += b64UrlChar((b0 % 4) * 16 + (floorDivPositive(b1, 16) % 16));
		if (remaining > 1) {
			result += b64UrlChar((b1 % 16) * 4 + (floorDivPositive(b2, 64) % 4));
		}
		if (remaining > 2) {
			result += b64UrlChar(b2 % 64);
		}
		i += 3;
	}
	return result;
}
/** Decode base64url string to byte values. */
export function base64UrlDecode(encoded) {
	if (encoded.length === 0) {
		return [];
	}
	const output = [];
	let i = 0;
	while (i < encoded.length) {
		const c0 = b64UrlValue(encoded[i]);
		const c1 = i + 1 < encoded.length ? b64UrlValue(encoded[i + 1]) : 0;
		const c2 = i + 2 < encoded.length ? b64UrlValue(encoded[i + 2]) : 0;
		const c3 = i + 3 < encoded.length ? b64UrlValue(encoded[i + 3]) : 0;
		const charsLeft = encoded.length - i;
		output[output.length] = c0 * 4 + floorDivPositive(c1, 16);
		if (charsLeft > 2) {
			output[output.length] = (c1 % 16) * 16 + floorDivPositive(c2, 4);
		}
		if (charsLeft > 3) {
			output[output.length] = (c2 % 4) * 64 + c3;
		}
		i += 4;
	}
	return output;
}
function b64UrlChar(value) {
	const ch = B64_CHARS[value];
	if (ch === "+") return "-";
	if (ch === "/") return "_";
	return ch;
}
function b64UrlValue(ch) {
	if (ch === "-") return 62;
	if (ch === "_") return 63;
	const code = ch.charCodeAt(0);
	if (code >= 65 && code <= 90) return code - 65;
	if (code >= 97 && code <= 122) return code - 71;
	if (code >= 48 && code <= 57) return code + 4;
	return 0;
}
/** Build a storable credential data object (publicKey as base64url string). */
export function buildStoredCredentialData(id, publicKeyBytes, counter, transports) {
	const result = {
		id,
		publicKey: base64UrlEncode(publicKeyBytes),
		counter,
	};
	if (transports !== undefined) {
		result.transports = transports;
	}
	return result;
}
/** Parse a stored credential object, decoding base64url publicKey to byte values.
 *  Returns null if required fields are missing. */
export function parseStoredCredentialData(stored) {
	if (typeof stored.id !== "string" || typeof stored.publicKey !== "string") {
		return null;
	}
	const counter = typeof stored.counter === "number" ? stored.counter : 0;
	const result = {
		id: stored.id,
		publicKeyBytes: base64UrlDecode(stored.publicKey),
		counter,
	};
	if (stored.transports !== undefined) {
		result.transports = stored.transports;
	}
	return result;
}
/** Build a storable challenge data object. */
export function buildStoredChallengeData(challenge, oauthReq, type) {
	return { challenge, oauthReq, type };
}
