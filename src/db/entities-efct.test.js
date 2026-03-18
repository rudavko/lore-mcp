/** @implements NFR-001 — Verify entity efct layer: D1 operations for canonical entities and aliases. */
import { describe, test, expect } from "bun:test";
import {
	insertEntityRow,
	insertAliasRow,
	deleteEntityRow,
	bulkReassignTripleSubject,
} from "./entities-write.efct.js";
import {
	selectEntityRow,
	selectEntityByName,
	resolveAliasRow,
} from "./entities-read.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
describe("insertEntityRow", () => {
	test("inserts entity, alias, and transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		await insertEntityRow({
			db,
			txId: "tx1",
			entityId: "e1",
			name: "Alice",
			aliasId: "a1",
			afterSnapshot: '{"id":"e1"}',
			now: "2024-01-01",
		});
		const entity = sqlite.prepare("SELECT * FROM canonical_entities WHERE id = ?").get("e1");
		expect(entity.name).toBe("Alice");
		const alias = sqlite.prepare("SELECT * FROM entity_aliases WHERE id = ?").get("a1");
		expect(alias.alias).toBe("alice");
	});
});
describe("selectEntityRow", () => {
	test("returns entity by id", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alice', '2024-01-01')`,
		);
		const row = await selectEntityRow(db, "e1");
		expect(row).not.toBeNull();
		expect(row.name).toBe("Alice");
	});
});
describe("selectEntityByName", () => {
	test("returns entity by name", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alice', '2024-01-01')`,
		);
		const row = await selectEntityByName(db, "Alice");
		expect(row).not.toBeNull();
	});
});
describe("resolveAliasRow", () => {
	test("resolves alias to entity via join", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alice', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES ('a1', 'alice', 'e1', '2024-01-01')`,
		);
		const row = await resolveAliasRow(db, "alice");
		expect(row).not.toBeNull();
		expect(row.id).toBe("e1");
	});
	test("returns null for unknown alias", async () => {
		const { db } = await createInitializedD1();
		const row = await resolveAliasRow(db, "unknown");
		expect(row).toBeNull();
	});
});
describe("insertAliasRow", () => {
	test("inserts alias and transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alice', '2024-01-01')`,
		);
		await insertAliasRow({
			db,
			txId: "tx1",
			aliasId: "a1",
			alias: "ally",
			entityId: "e1",
			afterSnapshot: '{"id":"a1"}',
			now: "2024-01-01",
		});
		const alias = sqlite.prepare("SELECT * FROM entity_aliases WHERE id = ?").get("a1");
		expect(alias.alias).toBe("ally");
		expect(alias.canonical_entity_id).toBe("e1");
	});
});
describe("bulkReassignTripleSubject", () => {
	test("reassigns triple subjects", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'Bob', 'knows', 'C', '2024-01-01')`,
		);
		await bulkReassignTripleSubject(db, "Alice", "Bob");
		const triple = sqlite.prepare("SELECT subject FROM triples WHERE id = ?").get("t1");
		expect(triple.subject).toBe("Alice");
	});
});
describe("deleteEntityRow", () => {
	test("deletes entity by id", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('e1', 'Alice', '2024-01-01')`,
		);
		await deleteEntityRow(db, "e1");
		const row = sqlite.prepare("SELECT * FROM canonical_entities WHERE id = ?").get("e1");
		expect(row).toBeFalsy();
	});
});
