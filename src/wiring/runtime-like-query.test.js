/** @implements FR-002 — Verify LIKE-query builder behavior used by lexical fallback retrieval. */
import { describe, expect, test } from "bun:test";
import { buildLikeQuery } from "./runtime.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
const std = createGlobalTestStd(globalThis);
describe("wiring/runtime.efct buildLikeQuery", () => {
	test("uses a single-character ESCAPE clause", () => {
		const query = buildLikeQuery(["topic-with-hyphen"], std);
		expect(query.whereClause.indexOf("ESCAPE '\\'")).toBeGreaterThan(-1);
		expect(query.whereClause.indexOf("ESCAPE '\\\\'")).toBe(-1);
	});
});
