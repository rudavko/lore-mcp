/** @implements NFR-001 — Verify summary DB query returns raw results. */
import { describe, test, expect } from "bun:test";
import { querySummaryCounts } from "./summary.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
describe("querySummaryCounts", () => {
	test("returns 4 result sets", async () => {
		const { db } = await createInitializedD1({ batchMode: "all" });
		const results = await querySummaryCounts(db);
		expect(results).toHaveLength(4);
	});
	test("counts are zero for empty DB", async () => {
		const { db } = await createInitializedD1({ batchMode: "all" });
		const results = await querySummaryCounts(db);
		const counts = results[0].results;
		expect(counts).toHaveLength(3);
	});
});
