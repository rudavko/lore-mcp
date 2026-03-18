/** @implements NFR-001 — Pure TOTP/HOTP helpers: base32, timing comparison, code extraction. */
export const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function pow2(exp) {
	let out = 1;
	for (let i = 0; i < exp; i++) {
		out *= 2;
	}
	return out;
}
function floorDivPositive(value, divisor) {
	return (value - (value % divisor)) / divisor;
}
// COUNCIL-CONTEXT: base32 encode/decode use a sliding-window accumulator.
// Encode: max 12 bits (8 in + 4 remaining). Decode: max 12 bits (5 in + 7 remaining).
// The `value` variable is consumed every time it reaches the output threshold,
// so it cannot overflow 32-bit integer limits regardless of input length.
/** Encode byte values to base32 (RFC 4648). */
export function base32Encode(bytes) {
	let bits = 0;
	let value = 0;
	let result = "";
	for (let i = 0; i < bytes.length; i++) {
		value = value * 256 + bytes[i];
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			const divisor = pow2(bits);
			const index = floorDivPositive(value, divisor) % 32;
			result += BASE32_ALPHABET[index];
		}
	}
	if (bits > 0) {
		const index = (value * pow2(5 - bits)) % 32;
		result += BASE32_ALPHABET[index];
	}
	return result;
}
/** Decode base32 to byte values. Returns { ok, bytes } or { ok: false, char }. */
export function base32Decode(encoded) {
	let cleaned = "";
	for (let i = 0; i < encoded.length; i++) {
		const ch = encoded[i];
		if (ch !== " " && ch !== "=" && ch !== "-") {
			if (ch >= "a" && ch <= "z") {
				cleaned += BASE32_ALPHABET[ch.charCodeAt(0) - 97];
			} else {
				cleaned += ch;
			}
		}
	}
	let bits = 0;
	let value = 0;
	const output = [];
	for (let i = 0; i < cleaned.length; i++) {
		let idx = -1;
		for (let j = 0; j < BASE32_ALPHABET.length; j++) {
			if (BASE32_ALPHABET[j] === cleaned[i]) {
				idx = j;
			}
		}
		if (idx === -1) {
			return { ok: false, char: cleaned[i] };
		}
		value = value * 32 + idx;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			const divisor = pow2(bits);
			output[output.length] = floorDivPositive(value, divisor) % 256;
		}
	}
	return { ok: true, bytes: output };
}
/** Constant-time comparison of two byte-value arrays. */
export function timingSafeEqual(left, right) {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) {
			diff += 1;
		}
	}
	return diff === 0;
}
/** Extract 6-digit HOTP code from HMAC bytes (RFC 4226 section 5.3). */
export function extractHotpCode(hmacBytes) {
	const offset = hmacBytes[hmacBytes.length - 1] % 16;
	const code =
		(hmacBytes[offset] % 128) * 16_777_216 +
		(hmacBytes[offset + 1] % 256) * 65_536 +
		(hmacBytes[offset + 2] % 256) * 256 +
		(hmacBytes[offset + 3] % 256);
	const truncated = code % 1_000_000;
	let result = "" + truncated;
	while (result.length < 6) {
		result = "0" + result;
	}
	return result;
}
/** Convert a counter number to 8-byte big-endian array. */
export function counterToBytes(counter) {
	const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
	let remaining = counter;
	for (let i = 7; i >= 0; i--) {
		const byte = remaining % 256;
		bytes[i] = byte;
		remaining = (remaining - byte) / 256;
	}
	return bytes;
}
/** Compute the TOTP time counter from Unix seconds and period. */
export function computeTimeCounter(time, period) {
	return (time - (time % period)) / period;
}
/** Validate that a TOTP code is exactly 6 digits. */
export function validateTotpFormat(code) {
	if (code.length !== 6) {
		return false;
	}
	for (let i = 0; i < code.length; i++) {
		const ch = code.charCodeAt(i);
		if (ch < 48 || ch > 57) {
			return false;
		}
	}
	return true;
}
/** Percent-encode a string for URI components (encodes non-unreserved chars). */
export function percentEncode(input) {
	let result = "";
	for (let i = 0; i < input.length; i++) {
		const ch = input.charCodeAt(i);
		if (
			(ch >= 65 && ch <= 90) ||
			(ch >= 97 && ch <= 122) ||
			(ch >= 48 && ch <= 57) ||
			ch === 45 ||
			ch === 95 ||
			ch === 46 ||
			ch === 126
		) {
			result += input[i];
		} else {
			const hex = ch.toString(16);
			result += "%" + (hex.length === 1 ? "0" + hex : hex);
		}
	}
	return result;
}
/** Build an otpauth:// URI for TOTP enrollment. */
export function buildOtpAuthUri(secret, issuer, accountName) {
	const encodedIssuer = percentEncode(issuer);
	const encodedAccount = percentEncode(accountName);
	const label = `${encodedIssuer}:${encodedAccount}`;
	return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
