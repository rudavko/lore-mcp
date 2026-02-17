import { describe, test, expect } from "bun:test";
import {
	base32Encode,
	base32Decode,
	computeHOTP,
	computeTOTP,
	verifyTOTP,
	buildOtpAuthUri,
	generateSecret,
	timingSafeEqual,
} from "./totp";

// ---- Base32 (RFC 4648) ----

describe("base32", () => {
	const vectors: [string, string][] = [
		["", ""],
		["f", "MY"],
		["fo", "MZXQ"],
		["foo", "MZXW6"],
		["foob", "MZXW6YQ"],
		["fooba", "MZXW6YTB"],
		["foobar", "MZXW6YTBOI"],
	];

	for (const [plain, encoded] of vectors) {
		test(`encode "${plain}" → "${encoded}"`, () => {
			expect(base32Encode(new TextEncoder().encode(plain))).toBe(encoded);
		});

		test(`decode "${encoded}" → "${plain}"`, () => {
			const decoded = new TextDecoder().decode(base32Decode(encoded));
			expect(decoded).toBe(plain);
		});
	}

	test("round-trip 20-byte secret", () => {
		const original = new Uint8Array(20);
		crypto.getRandomValues(original);
		const encoded = base32Encode(original);
		const decoded = base32Decode(encoded);
		expect(decoded).toEqual(original);
	});

	test("decode ignores spaces and padding", () => {
		const decoded = new TextDecoder().decode(base32Decode("MZXW 6YTB OI======"));
		expect(decoded).toBe("foobar");
	});

	test("decode is case-insensitive", () => {
		const decoded = new TextDecoder().decode(base32Decode("mzxw6ytboi"));
		expect(decoded).toBe("foobar");
	});

	test("decode rejects invalid characters", () => {
		expect(() => base32Decode("MZXW6!")).toThrow("Invalid base32 character");
	});
});

// ---- HOTP (RFC 4226 Appendix D) ----

describe("HOTP", () => {
	// RFC 4226 Appendix D test values
	// Secret = "12345678901234567890" (ASCII)
	const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));

	const vectors: [bigint, string][] = [
		[0n, "755224"],
		[1n, "287082"],
		[2n, "359152"],
		[3n, "969429"],
		[4n, "338314"],
		[5n, "254676"],
		[6n, "287922"],
		[7n, "162583"],
		[8n, "399871"],
		[9n, "520489"],
	];

	for (const [counter, expected] of vectors) {
		test(`counter=${counter} → ${expected}`, async () => {
			expect(await computeHOTP(secret, counter)).toBe(expected);
		});
	}
});

// ---- TOTP (RFC 6238 Appendix B) ----

describe("TOTP", () => {
	// RFC 6238 uses SHA-1 with secret "12345678901234567890"
	const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));

	// SHA-1 test vectors from RFC 6238 Appendix B
	const vectors: [number, string][] = [
		[59, "287082"],
		[1111111109, "081804"],
		[1111111111, "050471"],
		[1234567890, "005924"],
		[2000000000, "279037"],
		[20000000000, "353130"],
	];

	for (const [time, expected] of vectors) {
		test(`time=${time} → ${expected}`, async () => {
			expect(await computeTOTP(secret, time)).toBe(expected);
		});
	}
});

// ---- verifyTOTP ----

describe("verifyTOTP", () => {
	const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));

	test("accepts exact current code", async () => {
		const time = 59;
		const code = await computeTOTP(secret, time);
		expect(await verifyTOTP(secret, code, 1, time)).toBe(true);
	});

	test("accepts code from previous window", async () => {
		const time = 59;
		// Code for previous period (time=29 → counter=0)
		const prevCode = await computeTOTP(secret, time - 30);
		expect(await verifyTOTP(secret, prevCode, 1, time)).toBe(true);
	});

	test("accepts code from next window", async () => {
		const time = 59;
		// Code for next period (time=89 → counter=2)
		const nextCode = await computeTOTP(secret, time + 30);
		expect(await verifyTOTP(secret, nextCode, 1, time)).toBe(true);
	});

	test("rejects code outside window", async () => {
		const time = 59;
		// Code for 2 periods ahead (time=119 → counter=3)
		const farCode = await computeTOTP(secret, time + 60);
		expect(await verifyTOTP(secret, farCode, 1, time)).toBe(false);
	});

	test("rejects non-numeric code", async () => {
		expect(await verifyTOTP(secret, "abcdef", 1, 59)).toBe(false);
	});

	test("rejects wrong-length code", async () => {
		expect(await verifyTOTP(secret, "12345", 1, 59)).toBe(false);
		expect(await verifyTOTP(secret, "1234567", 1, 59)).toBe(false);
	});

	test("rejects completely wrong code", async () => {
		expect(await verifyTOTP(secret, "000000", 1, 59)).toBe(false);
	});
});

// ---- buildOtpAuthUri ----

describe("buildOtpAuthUri", () => {
	test("produces valid otpauth URI", () => {
		const uri = buildOtpAuthUri({ secret: "JBSWY3DPEHPK3PXP" });
		expect(uri).toStartWith("otpauth://totp/");
		expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
		expect(uri).toContain("issuer=Lore");
		expect(uri).toContain("algorithm=SHA1");
		expect(uri).toContain("digits=6");
		expect(uri).toContain("period=30");
	});

	test("encodes issuer and account in label", () => {
		const uri = buildOtpAuthUri({ secret: "ABC", issuer: "My App", accountName: "user@example.com" });
		expect(uri).toContain("otpauth://totp/My%20App:user%40example.com");
	});
});

// ---- generateSecret ----

describe("generateSecret", () => {
	test("returns valid base32 string", () => {
		const secret = generateSecret();
		expect(secret).toMatch(/^[A-Z2-7]+$/);
	});

	test("round-trips to 20 bytes", () => {
		const secret = generateSecret(20);
		const decoded = base32Decode(secret);
		expect(decoded.length).toBe(20);
	});

	test("generates different secrets", () => {
		const a = generateSecret();
		const b = generateSecret();
		expect(a).not.toBe(b);
	});
});

// ---- timingSafeEqual ----

describe("timingSafeEqual", () => {
	test("equal buffers return true", () => {
		const a = new Uint8Array([1, 2, 3]);
		expect(timingSafeEqual(a, a)).toBe(true);
	});

	test("different buffers return false", () => {
		const a = new Uint8Array([1, 2, 3]);
		const b = new Uint8Array([1, 2, 4]);
		expect(timingSafeEqual(a, b)).toBe(false);
	});

	test("different lengths return false", () => {
		const a = new Uint8Array([1, 2]);
		const b = new Uint8Array([1, 2, 3]);
		expect(timingSafeEqual(a, b)).toBe(false);
	});
});
