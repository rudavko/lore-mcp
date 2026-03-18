/** @implements NFR-001 — Verify auto-update token codec helpers and signing contract. */
import { describe, expect, test } from "bun:test";
import {
	encodeTokenPayload,
	decodeTokenPayload,
	signPayloadBase64Url,
} from "./auto-updates-token-codec.efct.js";

const Uint8ArrayCtor = globalThis.Uint8Array;

function makeCodecDeps(overrides = {}) {
	return {
		accessPassphrase: "test-passphrase",
		cryptoLike: crypto,
		textEncoderCtor: TextEncoder,
		textDecoderCtor: TextDecoder,
		uint8ArrayCtor: Uint8ArrayCtor,
		arrayFrom: Array.from,
		stringFromCharCode: String.fromCharCode,
		btoa,
		atob,
		...overrides,
	};
}

describe("domain/auto-updates-token-codec.efct", () => {
	test("encodes JSON payload text as unpadded base64url", () => {
		const encoded = encodeTokenPayload('{"repo":"owner/repo"}', makeCodecDeps());
		expect(encoded).toBe("eyJyZXBvIjoib3duZXIvcmVwbyJ9");
		expect(encoded.includes("+")).toBe(false);
		expect(encoded.includes("/")).toBe(false);
		expect(encoded.includes("=")).toBe(false);
	});

	test("encodes unicode payloads using URL-safe '-' and '_' substitutions", () => {
		expect(encodeTokenPayload("࠾", makeCodecDeps())).toBe("4KC-");
		expect(encodeTokenPayload("࠿", makeCodecDeps())).toBe("4KC_");
	});

	test("encodes short payloads without leaving one or two trailing padding characters", () => {
		expect(encodeTokenPayload("h", makeCodecDeps())).toBe("aA");
		expect(encodeTokenPayload("he", makeCodecDeps())).toBe("aGU");
		expect(encodeTokenPayload("test", makeCodecDeps())).toBe("dGVzdA");
	});

	test("decodes padded and unpadded base64url payloads", () => {
		const deps = makeCodecDeps();
		expect(decodeTokenPayload("eyJyZXBvIjoib3duZXIvcmVwbyJ9", deps)).toBe(
			'{"repo":"owner/repo"}',
		);
		expect(decodeTokenPayload("aGVsbG8", deps)).toBe("hello");
		expect(decodeTokenPayload("aA", deps)).toBe("h");
		expect(decodeTokenPayload("4KC-", deps)).toBe("࠾");
		expect(decodeTokenPayload("4KC_", deps)).toBe("࠿");
	});

	test("adds the expected padding back before calling atob", () => {
		const atobInputs = [];
		const deps = makeCodecDeps({
			atob: (value) => {
				atobInputs.push(value);
				if (value === "aA==") {
					return "h";
				}
				if (value === "aGU=") {
					return "he";
				}
				return "";
			},
		});

		expect(decodeTokenPayload("aA", deps)).toBe("h");
		expect(decodeTokenPayload("aGU", deps)).toBe("he");
		expect(atobInputs).toEqual(["aA==", "aGU="]);
	});

	test("signs payloads with HMAC-SHA256 and base64url output", async () => {
		let importKeyArgs = null;
		let signArgs = null;
		const deps = makeCodecDeps({
			cryptoLike: {
				subtle: {
					importKey: async (...args) => {
						importKeyArgs = args;
						return "test-key";
					},
					sign: async (...args) => {
						signArgs = args;
						return new Uint8ArrayCtor([251, 255]).buffer;
					},
				},
			},
		});

		const signature = await signPayloadBase64Url("payload", deps);
		expect(signature).toBe("-_8");
		expect(importKeyArgs[0]).toBe("raw");
		expect(importKeyArgs[3]).toBe(false);
		expect(importKeyArgs[4]).toEqual(["sign"]);
		expect(signArgs).toEqual(["HMAC", "test-key", new TextEncoder().encode("payload")]);
	});
});
