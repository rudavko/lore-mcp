// TOTP (RFC 6238) / HOTP (RFC 4226) implementation using Web Crypto.
// Zero dependencies — uses only standard APIs available in Cloudflare Workers.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// GEMINI-CONTEXT: base32 encode/decode use a sliding-window accumulator that never
// exceeds 12 bits (8 in + 4 remaining for encode, 5 in + 7 remaining for decode).
// The `value` variable is consumed every time it reaches the output threshold,
// so it cannot overflow 32-bit integer limits regardless of input length.

export function base32Encode(buffer: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let result = "";

	for (const byte of buffer) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
		}
	}
	if (bits > 0) {
		result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
	}
	return result;
}

export function base32Decode(encoded: string): Uint8Array {
	const cleaned = encoded.replace(/[\s=-]/g, "").toUpperCase();
	let bits = 0;
	let value = 0;
	const output: number[] = [];

	for (const char of cleaned) {
		const idx = BASE32_ALPHABET.indexOf(char);
		if (idx === -1) {
			throw new Error(`Invalid base32 character: ${char}`);
		}
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			output.push((value >>> bits) & 0xff);
		}
	}
	return new Uint8Array(output);
}

export function generateSecret(bytes = 20): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return base32Encode(buffer);
}

export async function computeHOTP(secret: string, counter: bigint): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		base32Decode(secret),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);

	// Counter as 8-byte big-endian
	const counterBuffer = new ArrayBuffer(8);
	const view = new DataView(counterBuffer);
	view.setBigUint64(0, counter, false);

	const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));

	// Dynamic truncation (RFC 4226 section 5.3)
	const offset = hmac[hmac.length - 1] & 0x0f;
	const code =
		((hmac[offset] & 0x7f) << 24) |
		((hmac[offset + 1] & 0xff) << 16) |
		((hmac[offset + 2] & 0xff) << 8) |
		(hmac[offset + 3] & 0xff);

	return String(code % 1_000_000).padStart(6, "0");
}

export async function computeTOTP(
	secret: string,
	time: number = Math.floor(Date.now() / 1000),
	period = 30,
): Promise<string> {
	const counter = BigInt(Math.floor(time / period));
	return computeHOTP(secret, counter);
}

export async function verifyTOTP(
	secret: string,
	code: string,
	window = 1,
	time: number = Math.floor(Date.now() / 1000),
	period = 30,
): Promise<boolean> {
	if (!/^\d{6}$/.test(code)) {
		return false;
	}

	const currentCounter = Math.floor(time / period);
	let valid = false;

	// Check all windows without short-circuit for timing safety
	for (let i = -window; i <= window; i++) {
		const candidate = await computeHOTP(secret, BigInt(currentCounter + i));
		if (timingSafeEqual(new TextEncoder().encode(candidate), new TextEncoder().encode(code))) {
			valid = true;
		}
	}

	return valid;
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index++) {
		diff |= left[index] ^ right[index];
	}
	return diff === 0;
}

export function buildOtpAuthUri({
	secret,
	issuer = "Lore",
	accountName = "owner",
}: {
	secret: string;
	issuer?: string;
	accountName?: string;
}): string {
	const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
	const params = new URLSearchParams({
		secret,
		issuer,
		algorithm: "SHA1",
		digits: "6",
		period: "30",
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}
