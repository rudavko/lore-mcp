/** @implements FR-020, FR-002 — Verify entry query pagination and scoped-filter traversal behavior. */
import { describe, expect, test } from "bun:test";
import { queryEntries } from "./entries.ops.efct.js";
describe("db/entries.ops query pagination", () => {
	test("does not emit non-null cursor for empty filtered page", async () => {
		let calls = 0;
		const result = await queryEntries(
			{ tags: ["qa"], limit: 1 },
			{
				buildWhereClause: (_params, decodedCursor) => ({
					whereClause: "deleted_at IS NULL",
					binds: [decodedCursor],
				}),
				queryEntryRows: async (_db, _whereClause, binds, _limit) => {
					const cursor = binds[0] ?? null;
					calls += 1;
					if (cursor === null) {
						return [
							{ id: "e3", topic: "t3", content: "c3", tags: "[]" },
							{ id: "e2", topic: "t2", content: "c2", tags: "[]" },
						];
					}
					if (cursor === "e2") {
						return [{ id: "e1", topic: "t1", content: "c1", tags: '["qa"]' }];
					}
					return [];
				},
				mapRows: (rows) =>
					rows.map((row) => ({
						id: row.id,
						topic: row.topic,
						content: row.content,
						tags: JSON.parse(row.tags || "[]"),
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					})),
				filterByTags: (items, tags) => {
					if (!tags || tags.length === 0) {
						return items;
					}
					return items.filter((item) => tags.every((tag) => item.tags.includes(tag)));
				},
				decodeCursor: (cursor) => cursor ?? null,
				encodeCursor: (value) => value,
				db: {},
			},
		);
		expect(calls).toBeGreaterThan(1);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].id).toBe("e1");
		expect(result.next_cursor).toBeNull();
	});
});
