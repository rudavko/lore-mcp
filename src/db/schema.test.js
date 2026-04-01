/** @implements NFR-001 — Verify schema initialization creates all required tables. */
import { describe, test, expect } from "bun:test";
import { initSchema } from "./schema.efct.js";
import { createD1, createSqliteMemoryDb } from "../test-helpers/db-d1.helper.js";
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
	test("initSchema repairs older canonical_entities rows without failing on D1-style updated_at rules", async () => {
		const sqlite = createSqliteMemoryDb();
		sqlite.exec(`CREATE TABLE canonical_entities (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`);
		sqlite.exec(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES ('ce1', 'Legacy Entity', '2024-01-01T00:00:00.000Z')`,
		);
		const db = createD1({ sqliteDb: sqlite });
		await initSchema(db);
		const entity = sqlite
			.prepare(
				"SELECT entity_type, source, valid_to_state, tags, updated_at FROM canonical_entities WHERE id = 'ce1'",
			)
			.get();
		expect(entity.entity_type).toBeNull();
		expect(entity.source).toBeNull();
		expect(entity.valid_to_state).toBe("unspecified");
		expect(entity.tags).toBe("[]");
		expect(entity.updated_at).toBe("2024-01-01T00:00:00.000Z");
	});
	test("initSchema propagates trigger creation failures after FTS table creation succeeds", async () => {
		const triggerError = new Error("trigger create failed");
		let ftsTableCreated = false;
		const db = {
			prepare: (sql) => {
				if (sql === "PRAGMA table_info(entries)") {
					return {
						all: async () => ({
							results: [
								{ name: "id" },
								{ name: "topic" },
								{ name: "content" },
								{ name: "tags" },
								{ name: "source" },
								{ name: "actor" },
								{ name: "confidence" },
								{ name: "embedding_status" },
								{ name: "embedding_retry_count" },
								{ name: "embedding_last_error" },
								{ name: "embedding_last_attempt_at" },
								{ name: "valid_from" },
								{ name: "valid_to" },
								{ name: "valid_to_state" },
								{ name: "expires_at" },
								{ name: "status" },
								{ name: "knowledge_type" },
								{ name: "memory_type" },
								{ name: "canonical_entity_id" },
								{ name: "created_at" },
								{ name: "updated_at" },
								{ name: "deleted_at" },
							],
						}),
					};
				}
				if (sql === "PRAGMA table_info(canonical_entities)") {
					return {
						all: async () => ({
							results: [
								{ name: "id" },
								{ name: "name" },
								{ name: "entity_type" },
								{ name: "source" },
								{ name: "confidence" },
								{ name: "valid_from" },
								{ name: "valid_to" },
								{ name: "valid_to_state" },
								{ name: "tags" },
								{ name: "produced_by" },
								{ name: "about" },
								{ name: "affects" },
								{ name: "specificity" },
								{ name: "created_at" },
								{ name: "updated_at" },
							],
						}),
					};
				}
				return {
					run: async () => {
						if (sql.includes("CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts")) {
							ftsTableCreated = true;
						}
						return { success: true, meta: {} };
					},
					all: async () => ({ results: [] }),
				};
			},
			batch: async (statements) => {
				const firstSql = statements[0]?.__sql ?? "";
				if (firstSql.includes("CREATE TRIGGER IF NOT EXISTS entries_fts_insert")) {
					throw triggerError;
				}
				for (const statement of statements) {
					await statement.run();
				}
				return [];
			},
		};
		const originalPrepare = db.prepare;
		db.prepare = (sql) => {
			const statement = originalPrepare(sql);
			statement.__sql = sql;
			return statement;
		};

		await expect(initSchema(db)).rejects.toBe(triggerError);
		expect(ftsTableCreated).toBe(true);
	});
});
