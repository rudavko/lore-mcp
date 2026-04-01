/** @implements NFR-001 — Verify semantic threshold parsing used to enforce retrieval relevance cutoffs. */
import { describe, expect, test } from "bun:test";
import { parseSemanticMinScore } from "./runtime.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
const std = createGlobalTestStd(globalThis);
describe("wiring/runtime.efct semantic threshold", () => {
	test("defaults to 0.25 when env value is missing", () => {
		expect(parseSemanticMinScore(undefined, std)).toBe(0.25);
	});
	test("clamps below 0 to 0", () => {
		expect(parseSemanticMinScore("-1", std)).toBe(0);
	});
	test("clamps above 1 to 1", () => {
		expect(parseSemanticMinScore("2", std)).toBe(1);
	});
	test("uses configured numeric threshold", () => {
		expect(parseSemanticMinScore("0.5", std)).toBe(0.5);
	});
});
