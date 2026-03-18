/** @implements NFR-001 — Verify ULID formatting produces valid output. */
import { describe, test, expect } from "bun:test";
import { formatUlid } from "./ulid.pure.js";
const TypedArray = globalThis.Uint8Array;
describe("ulid", () => {
	test("generates 26-character string", () => {
		const bytes = new TypedArray(16).fill(1);
		const id = formatUlid(1000000, bytes);
		expect(id).toHaveLength(26);
	});
	test("matches the expected encoding for a known timestamp and byte sequence", () => {
		const bytes = new TypedArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
		expect(formatUlid(1700000000000, bytes)).toBe("01HF7YAT000123456789ABCDEF");
	});
	test("wraps bytes at the Crockford base32 boundary", () => {
		const bytes = new TypedArray([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
		expect(formatUlid(1700000000000, bytes)).toBe("01HF7YAT00Z0123456789ABCDE");
	});
	test("is uppercase Crockford base32", () => {
		const bytes = new TypedArray(16).fill(5);
		const id = formatUlid(1000000, bytes);
		expect(id).toMatch(/^[0-9A-Z]{26}$/);
	});
	test("different inputs produce different outputs", () => {
		const bytes1 = new TypedArray(16).fill(1);
		const bytes2 = new TypedArray(16).fill(2);
		const a = formatUlid(1000000, bytes1);
		const b = formatUlid(1000000, bytes2);
		expect(a).not.toBe(b);
	});
	test("different timestamps produce different outputs", () => {
		const bytes = new TypedArray(16).fill(1);
		const a = formatUlid(1000000, bytes);
		const b = formatUlid(2000000, bytes);
		expect(a).not.toBe(b);
	});
});
