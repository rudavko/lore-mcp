/** @implements FR-009 — Verify entity query behavior for canonical names and aliases. */
import { describe, expect, test } from "bun:test";
import { queryEntities } from "./entities.ops.efct.js";
import { buildEntityQueryItems, buildEntityQueryState } from "./entities.pure.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
async function queryCanonicalRows(db, whereClause, binds, limit) {
	const sql = `SELECT ce.id, ce.name, ce.created_at FROM canonical_entities ce WHERE ${whereClause} ORDER BY ce.id DESC LIMIT ?`;
	const { results } = await db
		.prepare(sql)
		.bind(...binds, limit)
		.all();
	return results;
}
async function queryAliasRows(db, entityIds) {
	if (entityIds.length === 0) {
		return [];
	}
	const placeholders = entityIds.map(() => "?").join(",");
	const sql = `SELECT canonical_entity_id, alias FROM entity_aliases WHERE canonical_entity_id IN (${placeholders}) ORDER BY alias ASC`;
	const { results } = await db
		.prepare(sql)
		.bind(...entityIds)
		.all();
	return results;
}
describe("db/entities queryEntities", () => {
	test("returns entities with aliases and alias_count", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e2', 'Beta', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alpha', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES ('a1', 'alpha', 'e1', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES ('a2', 'a', 'e1', '2024-01-01')`,
		);
		const result = await queryEntities(
			{ limit: 10 },
			{
				buildEntityQueryState,
				buildEntityQueryItems,
				queryCanonicalEntityRows: queryCanonicalRows,
				queryAliasRowsByEntityIds: queryAliasRows,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
				db,
			},
		);
		expect(result.items).toHaveLength(2);
		const alpha = result.items.find((item) => item.id === "e1");
		expect(alpha).toBeDefined();
		expect(alpha.alias_count).toBe(2);
		expect(alpha.aliases).toEqual(["a", "alpha"]);
	});
	test("filters by alias substring", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e2', 'Beta', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alpha', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES ('a1', 'alpha', 'e1', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES ('a2', 'beta-team', 'e2', '2024-01-01')`,
		);
		const result = await queryEntities(
			{ alias: "team", limit: 10 },
			{
				buildEntityQueryState,
				buildEntityQueryItems,
				queryCanonicalEntityRows: queryCanonicalRows,
				queryAliasRowsByEntityIds: queryAliasRows,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
				db,
			},
		);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].id).toBe("e2");
	});
});
