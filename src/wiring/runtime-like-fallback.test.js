/** @implements FR-002, NFR-001 — Verify LIKE-token fallback behavior preserves lexical retrieval relevance. */
import { describe, expect, test } from "bun:test";
import { runLikeTokenFallback } from "./runtime.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
const std = createGlobalTestStd(globalThis);
describe("wiring/runtime.efct runLikeTokenFallback", () => {
	test("handles 5+ token queries without variable fan-out in a single SQL statement", async () => {
		const bindLengths = [];
		const result = await runLikeTokenFallback({
			db: {},
			query: "embedding backlog probe written at boundary",
			limit: 5,
			std,
			likeSearchRows: async (_db, _whereClause, binds) => {
				bindLengths.push(binds.length);
				if (binds[0].indexOf("%embedding%") >= 0) {
					return [{ id: "probe-lexical-b" }];
				}
				if (binds[0].indexOf("%written%") >= 0) {
					return [{ id: "probe-lexical-b" }];
				}
				return [];
			},
		});
		expect(result.length).toBe(1);
		expect(result[0].id).toBe("probe-lexical-b");
		expect(result[0].score).toBeGreaterThan(0);
		expect(bindLengths.length).toBeGreaterThanOrEqual(5);
		for (let i = 0; i < bindLengths.length; i++) {
			expect(bindLengths[i]).toBe(3);
		}
	});
});
