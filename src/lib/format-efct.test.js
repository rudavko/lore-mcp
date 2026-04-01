/** @implements NFR-001 — Verify JSON resource formatting (efct boundary). */
import { describe, test, expect } from "bun:test";
import { jsonResource } from "./format.efct.js";
import { createBaseStd } from "../test-helpers/runtime.shared.helper.js";
describe("Format helpers (efct)", () => {
	test("jsonResource creates resource content", () => {
		const r = jsonResource("lore://test", { a: 1 }, createBaseStd(globalThis));
		expect(r.content).toHaveLength(1);
		expect(r.content[0].type).toBe("resource");
	});
});
