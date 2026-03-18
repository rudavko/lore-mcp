/** @implements NFR-001 — Verify schema initialization creates all required tables. */
import { describe, test, expect } from "bun:test";
import { initSchema } from "./schema.efct.js";
import { createD1, createSqliteMemoryDb } from "../test-helpers/db-d1.test.js";
describe("schema", () => {
	test("initSchema creates all tables", async () => {
		const sqlite = createSqliteMemoryDb();
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		const tables = sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
			.all();
		const names = tables.map((t) => t.name);
		expect(names).toContain("entries");
		expect(names).toContain("triples");
		expect(names).toContain("transactions");
		expect(names).toContain("canonical_entities");
		expect(names).toContain("entity_aliases");
		expect(names).toContain("ingestion_tasks");
		expect(names).toContain("conflicts");
	});
	test("initSchema is idempotent", async () => {
		const sqlite = createSqliteMemoryDb();
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		await initSchema(db);
		const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
		expect(tables.length).toBeGreaterThan(0);
	});
	test("entries/triples include valid_to_state with unspecified default", async () => {
		const sqlite = createSqliteMemoryDb();
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 's', 'p', 'o', '2024-01-01')`,
		);
		const entry = sqlite.prepare("SELECT valid_to_state FROM entries WHERE id = 'e1'").get();
		const triple = sqlite.prepare("SELECT valid_to_state FROM triples WHERE id = 't1'").get();
		expect(entry.valid_to_state).toBe("unspecified");
		expect(triple.valid_to_state).toBe("unspecified");
	});
	test("entries include knowledge_type and memory_type defaults", async () => {
		const sqlite = createSqliteMemoryDb();
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		const entry = sqlite
			.prepare("SELECT knowledge_type, memory_type FROM entries WHERE id = 'e1'")
			.get();
		expect(entry.knowledge_type).toBe("observation");
		expect(entry.memory_type).toBe("fleeting");
	});
	test("entries include expires_at column defaulting to null", async () => {
		const sqlite = createSqliteMemoryDb();
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		const entry = sqlite.prepare("SELECT expires_at FROM entries WHERE id = 'e1'").get();
		expect(entry.expires_at).toBeNull();
	});
});
