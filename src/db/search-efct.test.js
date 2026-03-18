/** @implements NFR-001 — Verify search efct layer: FTS5 and LIKE search queries. */
import { describe, test, expect } from "bun:test";
import {
	fts5SearchRows,
	likeSearchRows,
	graphNeighborRows,
	selectEntriesByIds,
} from "./search.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
describe("likeSearchRows", () => {
	test("returns matching entries by LIKE", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 'Alice', 'knows things', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e2', 'Bob', 'other stuff', '[]', '2024-01-01', '2024-01-01')`,
		);
		const rows = await likeSearchRows(db, "topic LIKE ? ESCAPE '\\'", ["%Alice%"], 10);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("e1");
	});
});
describe("fts5SearchRows", () => {
	test("binds MATCH query as a single parameter (plus limit)", async () => {
		const boundArgs = [];
		const db = {
			prepare: (_sql) => ({
				bind: (...args) => {
					boundArgs.push(args);
					return {
						all: async () => ({ results: [{ id: "probe-lexical-b", rank: -1 }] }),
					};
				},
			}),
		};
		const rows = await fts5SearchRows(
			db,
			'"serverless" OR "sqlite" OR "workers" OR "search" OR "text"',
			50,
		);
		expect(rows).toHaveLength(1);
		expect(boundArgs).toHaveLength(1);
		expect(boundArgs[0]).toHaveLength(2);
		expect(boundArgs[0][0]).toBe('"serverless" OR "sqlite" OR "workers" OR "search" OR "text"');
		expect(boundArgs[0][1]).toBe(50);
	});
});
describe("graphNeighborRows", () => {
	test("returns triples matching subjects or objects", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'Alice', 'knows', 'Bob', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t2', 'Carol', 'likes', 'Dave', '2024-01-01')`,
		);
		const rows = await graphNeighborRows(db, "subject IN (?) AND deleted_at IS NULL", [
			"Alice",
		]);
		expect(rows).toHaveLength(1);
	});
});
describe("selectEntriesByIds", () => {
	test("returns entries matching id list", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 'a', 'c1', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e2', 'b', 'c2', '[]', '2024-01-01', '2024-01-01')`,
		);
		const rows = await selectEntriesByIds(db, "id IN (?, ?) AND deleted_at IS NULL", [
			"e1",
			"e2",
		]);
		expect(rows).toHaveLength(2);
	});
});
