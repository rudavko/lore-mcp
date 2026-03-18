/** @implements NFR-001 — Verify entry efct layer: D1 CRUD operations. */
import { describe, test, expect } from "bun:test";
import {
	insertEntryRow,
	selectEntryRow,
	updateEntryRow,
	softDeleteEntryRow,
	queryEntryRows,
} from "./entries.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
describe("insertEntryRow", () => {
	test("inserts entry and transaction rows", async () => {
		const { sqlite, db } = await createInitializedD1();
		await insertEntryRow({
			db,
			txId: "tx1",
			entryId: "e1",
			topic: "topic1",
			content: "content1",
			tagsJson: '["a"]',
			source: "src",
			actor: null,
			confidence: 0.9,
			validFrom: null,
			validTo: null,
			validToState: "unspecified",
			expiresAt: null,
			knowledgeType: "observation",
			memoryType: "fleeting",
			status: "active",
			canonicalEntityId: null,
			afterSnapshot: '{"id":"e1"}',
			now: "2024-01-01",
		});
		const entry = sqlite.prepare("SELECT * FROM entries WHERE id = ?").get("e1");
		expect(entry.topic).toBe("topic1");
		expect(entry.tags).toBe('["a"]');
		expect(entry.source).toBe("src");
		const tx = sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get("tx1");
		expect(tx.op).toBe("CREATE");
		expect(tx.entity_type).toBe("entry");
	});
	test("bundles entry + auto-link writes in one batch", async () => {
		const { sqlite, db } = await createInitializedD1();
		await insertEntryRow({
			db,
			txId: "tx2",
			entryId: "e2",
			topic: "Alpha",
			content: "content2",
			tagsJson: "[]",
			source: null,
			actor: null,
			confidence: null,
			validFrom: null,
			validTo: null,
			validToState: "unspecified",
			expiresAt: null,
			knowledgeType: "observation",
			memoryType: "fleeting",
			status: "active",
			canonicalEntityId: null,
			afterSnapshot: '{"id":"e2"}',
			now: "2024-01-01",
			autoLinkPlan: {
				entity_id: "ce-alpha",
				entity_name: "Alpha",
				alias_id: "ea-alpha",
				alias: "alpha",
				entity_created: true,
				alias_created: true,
			},
		});
		const linkedEntry = sqlite
			.prepare("SELECT canonical_entity_id FROM entries WHERE id = ?")
			.get("e2");
		expect(linkedEntry.canonical_entity_id).toBe("ce-alpha");
		const entity = sqlite
			.prepare("SELECT id FROM canonical_entities WHERE id = ?")
			.get("ce-alpha");
		expect(entity.id).toBe("ce-alpha");
		const alias = sqlite
			.prepare("SELECT alias FROM entity_aliases WHERE id = ?")
			.get("ea-alpha");
		expect(alias.alias).toBe("alpha");
	});
});
describe("selectEntryRow", () => {
	test("returns row for existing entry", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		const row = await selectEntryRow(db, "e1");
		expect(row).not.toBeNull();
		expect(row.topic).toBe("t");
	});
	test("returns null for deleted entry", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at, deleted_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01', '2024-01-02')`,
		);
		const row = await selectEntryRow(db, "e1");
		expect(row).toBeNull();
	});
	test("returns null for non-existent entry", async () => {
		const { db } = await createInitializedD1();
		const row = await selectEntryRow(db, "missing");
		expect(row).toBeNull();
	});
});
describe("updateEntryRow", () => {
	test("updates entry fields and records transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 'old', 'old-c', '[]', '2024-01-01', '2024-01-01')`,
		);
		await updateEntryRow({
			db,
			id: "e1",
			txId: "tx1",
			topic: "new",
			content: "new-c",
			tagsJson: '["b"]',
			source: "web",
			actor: null,
			confidence: null,
			validFrom: null,
			validTo: null,
			validToState: "unspecified",
			expiresAt: null,
			knowledgeType: "fact",
			memoryType: "core",
			status: "active",
			canonicalEntityId: null,
			beforeSnapshot: '{"before":"snap"}',
			afterSnapshot: '{"after":"snap"}',
			now: "2024-01-02",
		});
		const entry = sqlite.prepare("SELECT * FROM entries WHERE id = ?").get("e1");
		expect(entry.topic).toBe("new");
		expect(entry.content).toBe("new-c");
		expect(entry.tags).toBe('["b"]');
		expect(entry.knowledge_type).toBe("fact");
		expect(entry.memory_type).toBe("core");
		expect(entry.updated_at).toBe("2024-01-02");
		const tx = sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get("tx1");
		expect(tx.op).toBe("UPDATE");
	});
});
describe("softDeleteEntryRow", () => {
	test("sets deleted_at and records transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		await softDeleteEntryRow({
			db,
			id: "e1",
			txId: "tx1",
			beforeSnapshot: '{"before":"snap"}',
			now: "2024-01-02",
		});
		const entry = sqlite.prepare("SELECT * FROM entries WHERE id = ?").get("e1");
		expect(entry.deleted_at).toBe("2024-01-02");
		const tx = sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get("tx1");
		expect(tx.op).toBe("DELETE");
	});
});
describe("queryEntryRows", () => {
	test("returns rows matching WHERE clause", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 'a', 'c1', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e2', 'b', 'c2', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at, deleted_at) VALUES ('e3', 'c', 'c3', '[]', '2024-01-01', '2024-01-01', '2024-01-02')`,
		);
		const rows = await queryEntryRows(db, "deleted_at IS NULL", [], 10);
		expect(rows).toHaveLength(2);
	});
	test("applies binds to WHERE clause", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 'alpha', 'c1', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e2', 'beta', 'c2', '[]', '2024-01-01', '2024-01-01')`,
		);
		const rows = await queryEntryRows(db, "deleted_at IS NULL AND topic = ?", ["alpha"], 10);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("e1");
	});
});
