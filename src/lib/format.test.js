/** @implements NFR-001 — Verify pure MCP response formatting helpers. */
import { describe, test, expect } from "bun:test";
import { textResult, errorResult, listToText } from "./format.pure.js";
describe("Format helpers (pure)", () => {
	test("textResult wraps string", () => {
		const r = textResult("hello");
		expect(r.content).toHaveLength(1);
		expect(r.content[0].type).toBe("text");
		expect(r.content[0].text).toBe("hello");
		expect(r.isError).toBeUndefined();
	});
	test("errorResult sets isError flag", () => {
		const r = errorResult("bad");
		expect(r.content).toHaveLength(1);
		expect(r.content[0].type).toBe("text");
		expect(r.content[0].text).toBe("bad");
		expect(r.isError).toBe(true);
	});
	test("listToText formats array as numbered list", () => {
		const text = listToText(["alpha", "beta"]);
		expect(text).toBe("1. alpha\n2. beta");
		expect(text).toContain("1.");
		expect(text).toContain("alpha");
		expect(text).toContain("2.");
		expect(text).toContain("beta");
	});
	test("listToText handles empty array", () => {
		const text = listToText([]);
		expect(text).toBe("(none)");
	});
});
