/** @implements NFR-001 — Verify signed auto-updates setup token issue/read behavior. */
import { describe, expect, test } from "bun:test";
import {
	decodeSetupPayload,
	issueAutoUpdatesSetupToken,
	readAutoUpdatesSetupToken,
	splitSetupToken,
	validateAutoUpdatesSetupPayload,
} from "./auto-updates-token.efct.js";
import {
	signPayloadBase64Url,
	encodeTokenPayload,
	decodeTokenPayload,
} from "./auto-updates-token-codec.efct.js";
import { safeStringEqual } from "../lib/constant-time-equal.pure.js";
const Uint8ArrayCtor = globalThis.Uint8Array;

function makeDeps(nowMs = () => 1_000) {
	return {
		accessPassphrase: "test-passphrase",
		cryptoLike: crypto,
		textEncoderCtor: TextEncoder,
		textDecoderCtor: TextDecoder,
		uint8ArrayCtor: Uint8ArrayCtor,
		arrayFrom: Array.from,
		stringFromCharCode: String.fromCharCode,
		numberIsFinite: Number.isFinite,
			btoa,
			atob,
			jsonStringify: JSON.stringify,
			jsonParse: JSON.parse,
			nowMs,
			safeStringEqual,
			signPayloadBase64Url,
			encodeTokenPayload,
			decodeTokenPayload,
	};
}

async function signPayload(payload, deps) {
	const payloadText = typeof payload === "string" ? payload : deps.jsonStringify(payload);
	const payloadBase64Url = encodeTokenPayload(payloadText, deps);
	const signatureBase64Url = await signPayloadBase64Url(payloadBase64Url, deps);
	return payloadBase64Url + "." + signatureBase64Url;
}

describe("domain/auto-updates-token.efct", () => {
	test("issues a signed token that round-trips to the target repo", async () => {
		const deps = makeDeps(() => 1_000);
		const token = await issueAutoUpdatesSetupToken("owner/repo", 9_000, deps);
		const parsed = await readAutoUpdatesSetupToken(token, deps);
		expect(parsed).toEqual({
			targetRepo: "owner/repo",
			expiresAtMs: 9_000,
		});
	});

	test("rejects tampered tokens", async () => {
		const deps = makeDeps(() => 1_000);
		const token = await issueAutoUpdatesSetupToken("owner/repo", 9_000, deps);
		const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
		expect(await readAutoUpdatesSetupToken(tampered, deps)).toBeNull();
	});

	test("rejects malformed token shapes", async () => {
		const deps = makeDeps(() => 1_000);
		expect(await readAutoUpdatesSetupToken(123, deps)).toBeNull();
		expect(await readAutoUpdatesSetupToken("payloadonly", deps)).toBeNull();
		expect(await readAutoUpdatesSetupToken(".signature", deps)).toBeNull();
		expect(await readAutoUpdatesSetupToken("payload.", deps)).toBeNull();
		expect(await readAutoUpdatesSetupToken("a.b.c", deps)).toBeNull();
	});

	test("splitSetupToken validates token structure directly", () => {
		expect(splitSetupToken(123)).toBeNull();
		expect(splitSetupToken("payload")).toBeNull();
		expect(splitSetupToken(".signature")).toBeNull();
		expect(splitSetupToken("payload.")).toBeNull();
		expect(splitSetupToken("a.b.c")).toBeNull();
		expect(splitSetupToken("payload.signature")).toEqual({
			payloadBase64Url: "payload",
			signatureBase64Url: "signature",
		});
	});

	test("safeStringEqual handles equal, unequal, shorter, and longer strings", async () => {
		const deps = makeDeps(() => 1_000);
		expect(await safeStringEqual("abc", "abc", deps)).toBe(true);
		expect(await safeStringEqual("abc", "abd", deps)).toBe(false);
		expect(await safeStringEqual("abc", "ab", deps)).toBe(false);
		expect(await safeStringEqual("ab", "abc", deps)).toBe(false);
	});

	test("validateAutoUpdatesSetupPayload accepts only well-formed live payloads", () => {
		const deps = makeDeps(() => 1_000);
		expect(validateAutoUpdatesSetupPayload(null, deps)).toBeNull();
		expect(validateAutoUpdatesSetupPayload("bad", deps)).toBeNull();
		expect(validateAutoUpdatesSetupPayload({ repo: "", exp: 9_000 }, deps)).toBeNull();
		expect(validateAutoUpdatesSetupPayload({ repo: "owner/repo", exp: "9_000" }, deps)).toBeNull();
		expect(validateAutoUpdatesSetupPayload({ repo: "owner/repo", exp: 1_000 }, deps)).toBeNull();
		expect(
			validateAutoUpdatesSetupPayload({ repo: "owner/repo", exp: 9_000 }, deps),
		).toEqual({
			targetRepo: "owner/repo",
			expiresAtMs: 9_000,
		});
	});

	test("decodeSetupPayload returns the explicit failure sentinel on parse errors", () => {
		const deps = makeDeps(() => 1_000);
		const payloadBase64Url = encodeTokenPayload("not-json", deps);
		expect(decodeSetupPayload(payloadBase64Url, deps)).toEqual({
			ok: false,
			payload: {
				repo: "__invalid__/__invalid__",
				exp: 1_001,
			},
		});
	});

	test("rejects truncated signatures with a different length", async () => {
		const deps = makeDeps(() => 1_000);
		const token = await issueAutoUpdatesSetupToken("owner/repo", 9_000, deps);
		expect(await readAutoUpdatesSetupToken(token.slice(0, -1), deps)).toBeNull();
	});

	test("rejects invalid JSON payloads", async () => {
		const deps = makeDeps(() => 1_000);
		const token = await signPayload("not-json", deps);
		expect(await readAutoUpdatesSetupToken(token, deps)).toBeNull();
	});

	test("rejects non-object payloads", async () => {
		const deps = makeDeps(() => 1_000);
		const token = await signPayload("1", deps);
		expect(await readAutoUpdatesSetupToken(token, deps)).toBeNull();
	});

	test("rejects missing or empty repos", async () => {
		const deps = makeDeps(() => 1_000);
		expect(await readAutoUpdatesSetupToken(await signPayload({ v: 1, exp: 9_000 }, deps), deps)).toBeNull();
		expect(
			await readAutoUpdatesSetupToken(
				await signPayload({ v: 1, repo: "", exp: 9_000 }, deps),
				deps,
			),
		).toBeNull();
	});

	test("rejects invalid expiry payloads", async () => {
		const deps = makeDeps(() => 1_000);
		expect(
			await readAutoUpdatesSetupToken(
				await signPayload({ v: 1, repo: "owner/repo", exp: "9_000" }, deps),
				deps,
			),
		).toBeNull();
	});

	test("rejects expired tokens", async () => {
		const token = await issueAutoUpdatesSetupToken("owner/repo", 9_000, makeDeps(() => 1_000));
		expect(await readAutoUpdatesSetupToken(token, makeDeps(() => 9_001))).toBeNull();
	});

	test("rejects tokens that expire exactly at the current time", async () => {
		const deps = makeDeps(() => 9_000);
		const token = await signPayload({ v: 1, repo: "owner/repo", exp: 9_000 }, deps);
		expect(await readAutoUpdatesSetupToken(token, deps)).toBeNull();
	});
});
