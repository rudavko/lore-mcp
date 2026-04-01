/** @implements FR-001 — Verify extracted default-handler helper behavior stays stable under refactors. */
import { describe, expect, test } from "bun:test";
import {
	base32Encode,
	computeTimeCounter,
	counterToBytes,
	extractHotpCode,
	validateTotpFormat,
	base32Decode,
} from "../totp.pure.js";
import { byteValuesToHexString } from "../lib/auth-helpers.pure.js";
import { createDefaultHandlerHelpers } from "./default-handler-helpers.orch.2.js";

const TextEncoderCtor = globalThis.TextEncoder;
const Uint8ArrayCtor = globalThis.Uint8Array;
const MapCtor = globalThis.Map;
const ResponseCtor = globalThis.Response;

function createHelpers(overrides = {}) {
	const platform = {
		mapCtor: MapCtor,
		decodeUriComponent: globalThis.decodeURIComponent,
		uint8ArrayCtor: Uint8ArrayCtor,
		cryptoLike: globalThis.crypto,
		byteValuesToHexString,
		arrayFrom: Array.from,
		textEncoderCtor: TextEncoderCtor,
		nowMs: () => 1_710_000_000_000,
		floor: Math.floor,
		responseCtor: ResponseCtor,
		typeErrorCtor: TypeError,
		...(overrides.platform || {}),
	};
	const otp = {
		validateTotpFormat,
		base32Decode,
		computeTimeCounter,
		counterToBytes,
		extractHotpCode,
		...(overrides.otp || {}),
	};
	return createDefaultHandlerHelpers({
		platform,
		otp,
	});
}

async function generateTotp(secret, nowMs) {
	const decoded = base32Decode(secret);
	if (!decoded.ok) {
		throw new Error("invalid secret");
	}
	const counter = computeTimeCounter(Math.floor(nowMs / 1000), 30);
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

describe("wiring/default-handler-helpers.orch", () => {
	test("parseCookies decodes valid values and falls back for malformed escapes", () => {
		const decodeCalls = [];
		const helpers = createHelpers({
			platform: {
				decodeUriComponent: (value) => {
				decodeCalls.push(value);
				if (value === "%E0%A4%A") {
					throw new Error("bad escape");
				}
				return globalThis.decodeURIComponent(value);
			},
			},
		});

		const cookies = helpers.parseCookies(
			"good=value%20ok; broken=%E0%A4%A; skip; blank=; spaced = %7Bjson%7D ",
		);

		expect(decodeCalls).toEqual(["value%20ok", "%E0%A4%A", "", "%7Bjson%7D"]);
		expect(Array.from(cookies.entries())).toEqual([
			["good", "value ok"],
			["broken", "%E0%A4%A"],
			["blank", ""],
			["spaced", "{json}"],
		]);
	});

	test("randomTokenHex uses the requested byte length", () => {
		const seenLengths = [];
		const helpers = createHelpers({
			platform: {
				cryptoLike: {
				getRandomValues: (bytes) => {
					seenLengths.push(bytes.length);
					for (let i = 0; i < bytes.length; i++) {
						bytes[i] = i + 1;
					}
					return bytes;
				},
			},
			},
		});

		expect(helpers.randomTokenHex(4)).toBe("01020304");
		expect(seenLengths).toEqual([4]);
	});

	test("formatSecretForDisplay groups characters every four positions", () => {
		const helpers = createHelpers();
		expect(helpers.formatSecretForDisplay("ABCDEFGH1234")).toBe("ABCD EFGH 1234");
		expect(helpers.formatSecretForDisplay("ABC")).toBe("ABC");
	});

	test("safeStringEqual respects equal, unequal, and length-mismatched values", async () => {
		const helpers = createHelpers();
		expect(await helpers.safeStringEqual("123456", "123456")).toBe(true);
		expect(await helpers.safeStringEqual("123456", "123450")).toBe(false);
		expect(await helpers.safeStringEqual("123456", "12345")).toBe(false);
	});

	test("verifyTotp accepts the current window and rejects invalid or stale codes", async () => {
		const nowMs = 1_710_000_000_000;
		const secret = base32Encode([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		const helpers = createHelpers({ platform: { nowMs: () => nowMs } });
		const currentCode = await generateTotp(secret, nowMs);
		const staleCode = await generateTotp(secret, nowMs - 120_000);

		expect(await helpers.verifyTotp(secret, currentCode)).toBe(true);
		expect(await helpers.verifyTotp(secret, staleCode)).toBe(false);
		expect(await helpers.verifyTotp(secret, "12AB56")).toBe(false);
		expect(await helpers.verifyTotp("not-base32", currentCode)).toBe(false);
	});

	test("createSimpleRouter runs middleware and dispatches by method", async () => {
		const helpers = createHelpers();
		const calls = [];
		const router = helpers.createSimpleRouter();
		router.use(async () => {
			calls.push("mw1");
		});
		router.use(async () => {
			calls.push("mw2");
		});
		router.get("/ok", async () => {
			calls.push("get");
			return "handled-get";
		});
		router.post("/ok", async () => {
			calls.push("post");
			return "handled-post";
		});

		expect(await router.handle("GET", "/ok")).toBe("handled-get");
		expect(await router.handle("POST", "/ok")).toBe("handled-post");
		expect(await router.handle("PATCH", "/ok")).toBeNull();
		expect(calls).toEqual(["mw1", "mw2", "get", "mw1", "mw2", "post", "mw1", "mw2"]);
	});

	test("ensureResponse preserves responses and rejects invalid route results", () => {
		const helpers = createHelpers();
		const response = new ResponseCtor("ok", { status: 201 });

		expect(helpers.ensureResponse(response)).toBe(response);
		expect(() => helpers.ensureResponse({ status: 204 })).toThrow(
			"Route handlers must return a Response instance",
		);
		expect(() => helpers.ensureResponse(null)).toThrow(
			"Route handlers must return a Response instance",
		);
	});
});
