/** @implements NFR-001 — Verify auth helper pure functions. */
import { describe, test, expect } from "bun:test";
import {
	failKey,
	lockKey,
	bodyString,
	extractClientIp,
	nextFailCount,
	isLockoutReached,
	byteValuesToHexString,
} from "./auth-helpers.pure.js";
describe("auth-helpers.pure", () => {
	describe("failKey / lockKey", () => {
		test("failKey builds prefixed key", () => {
			expect(failKey("1.2.3.4")).toBe("ks:authfail:1.2.3.4");
		});
		test("lockKey builds prefixed key", () => {
			expect(lockKey("1.2.3.4")).toBe("ks:authlock:1.2.3.4");
		});
	});
	describe("bodyString", () => {
		test("returns string value as-is", () => {
			expect(bodyString("hello")).toBe("hello");
		});
		test("returns empty for non-string", () => {
			expect(bodyString(42)).toBe("");
			expect(bodyString(null)).toBe("");
			expect(bodyString(undefined)).toBe("");
		});
	});
	describe("extractClientIp", () => {
		test("returns header value when present", () => {
			expect(extractClientIp("1.2.3.4")).toBe("1.2.3.4");
		});
		test("returns unknown when undefined", () => {
			expect(extractClientIp(undefined)).toBe("unknown");
		});
		test("returns unknown when empty", () => {
			expect(extractClientIp("")).toBe("unknown");
		});
	});
	describe("nextFailCount", () => {
		test("returns 1 for null", () => {
			expect(nextFailCount(null)).toBe(1);
		});
		test("returns 1 for empty string", () => {
			expect(nextFailCount("")).toBe(1);
		});
		test("returns 1 for non-numeric string", () => {
			expect(nextFailCount("abc")).toBe(1);
		});
		test("increments existing count", () => {
			expect(nextFailCount("3")).toBe(4);
		});
		test("increments zero", () => {
			expect(nextFailCount("0")).toBe(1);
		});
	});
	describe("isLockoutReached", () => {
		test("false below threshold", () => {
			expect(isLockoutReached(1)).toBe(false);
			expect(isLockoutReached(4)).toBe(false);
		});
		test("true at threshold", () => {
			expect(isLockoutReached(5)).toBe(true);
		});
		test("true above threshold", () => {
			expect(isLockoutReached(10)).toBe(true);
		});
	});
	describe("byteValuesToHexString", () => {
		test("converts bytes to hex", () => {
			expect(byteValuesToHexString([0, 1, 255])).toBe("0001ff");
		});
		test("handles empty array", () => {
			expect(byteValuesToHexString([])).toBe("");
		});
		test("pads single digits", () => {
			expect(byteValuesToHexString([10])).toBe("0a");
		});
	});
});
