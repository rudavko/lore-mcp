/** @implements NFR-003, FR-002 — Verify graph expansion remains bounded and deduplicated. */
import { describe, expect, test } from "bun:test";
import { expandGraphSignals, selectActiveEntriesByIdsChunked } from "./runtime.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
const std = createGlobalTestStd(globalThis);
describe("wiring/runtime.efct expandGraphSignals", () => {
	test("returns non-zero graph scores for connected seed and neighbor entries", async () => {
		let selectCall = 0;
		const result = await expandGraphSignals({
			db: {},
			seedIds: ["e-seed"],
			std,
			selectEntriesByIds: async (_db, _whereClause, binds) => {
				selectCall += 1;
				if (selectCall === 1) {
					expect(binds).toEqual(["e-seed"]);
					return [{ id: "e-seed", topic: "Eiffel Tower" }];
				}
				expect(selectCall).toBe(2);
				return [{ id: "e-neighbor", topic: "Paris" }];
			},
			graphNeighborRows: async () => [{ subject: "Eiffel Tower", object: "Paris" }],
		});
		expect(result.some((row) => row.id === "e-seed" && row.score > 0 && row.hops === 0)).toBe(
			true,
		);
		expect(
			result.some((row) => row.id === "e-neighbor" && row.score > 0 && row.hops === 1),
		).toBe(true);
	});
	test("chunks large entry-id lookups to keep bind counts bounded", async () => {
		const bindCounts = [];
		const ids = Array.from({ length: 95 }, (_value, index) => `e-${index}`);
		const rows = await selectActiveEntriesByIdsChunked({
			db: {},
			ids,
			selectEntriesByIds: async (_db, _whereClause, binds) => {
				bindCounts.push(binds.length);
				return binds.map((id) => ({ id, topic: `topic-${id}` }));
			},
		});
		expect(rows).toHaveLength(95);
		expect(bindCounts).toEqual([40, 40, 15]);
	});
	test("chunks graph expansion seed and related-term lookups", async () => {
		const seedIds = Array.from({ length: 45 }, (_value, index) => `e-${index}`);
		const selectBindCounts = [];
		const graphBindCounts = [];
		await expandGraphSignals({
			db: {},
			seedIds,
			std,
			selectEntriesByIds: async (_db, whereClause, binds) => {
				selectBindCounts.push(binds.length);
				if (whereClause.startsWith("id IN")) {
					return binds.map((id) => ({ id, topic: `topic-${id}` }));
				}
				return binds.map((topic) => ({ id: `neighbor-${topic}`, topic }));
			},
			graphNeighborRows: async (_db, _whereClause, binds) => {
				graphBindCounts.push(binds.length);
				const half = binds.length / 2;
				const rows = [];
				for (let i = 0; i < half; i++) {
					rows.push({
						subject: String(binds[i]),
						object: `related-${String(binds[i])}`,
					});
				}
				return rows;
			},
		});
		expect(selectBindCounts).toEqual([40, 5, 40, 5]);
		expect(graphBindCounts).toEqual([80, 10]);
	});
});
