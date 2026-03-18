/** @implements FR-001, FR-003, FR-014 — Verify canonical validity derivation and normalization helpers. */
import { describe, expect, test } from "bun:test";
import {
	deriveValidToStateFromInput,
	isInfiniteValidTo,
	normalizeValidToState,
} from "./validity.pure.js";
describe("lib/validity.pure", () => {
	test("isInfiniteValidTo detects accepted sentinels", () => {
		expect(isInfiniteValidTo("infinite")).toBe(true);
		expect(isInfiniteValidTo("Infinity")).toBe(true);
		expect(isInfiniteValidTo("forever")).toBe(true);
		expect(isInfiniteValidTo("  infinity  ")).toBe(true);
		expect(isInfiniteValidTo("2099-12-31T00:00:00.000Z")).toBe(false);
	});
	test("deriveValidToStateFromInput maps omitted/null to unspecified", () => {
		expect(deriveValidToStateFromInput(undefined)).toEqual({
			validTo: undefined,
			validToState: "unspecified",
		});
		expect(deriveValidToStateFromInput(null)).toEqual({
			validTo: null,
			validToState: "unspecified",
		});
	});
	test("deriveValidToStateFromInput maps infinite to explicit infinite", () => {
		expect(deriveValidToStateFromInput("infinite")).toEqual({
			validTo: null,
			validToState: "infinite",
		});
	});
	test("deriveValidToStateFromInput maps date to bounded", () => {
		expect(deriveValidToStateFromInput("2026-01-01T00:00:00.000Z")).toEqual({
			validTo: "2026-01-01T00:00:00.000Z",
			validToState: "bounded",
		});
	});
	test("normalizeValidToState falls back based on stored valid_to value", () => {
		expect(normalizeValidToState(undefined, null)).toBe("unspecified");
		expect(normalizeValidToState(undefined, "2026-01-01T00:00:00.000Z")).toBe("bounded");
		expect(normalizeValidToState("infinite", null)).toBe("infinite");
	});
	test("normalizeValidToState preserves explicit accepted states", () => {
		expect(normalizeValidToState("unspecified", "2026-01-01T00:00:00.000Z")).toBe(
			"unspecified",
		);
		expect(normalizeValidToState("bounded", null)).toBe("bounded");
		expect(normalizeValidToState("infinite", "2026-01-01T00:00:00.000Z")).toBe("infinite");
	});
});
