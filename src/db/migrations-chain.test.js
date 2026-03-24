/** @implements NFR-001 — Fresh-install migration chain must apply cleanly in order. */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../../lore-mcp-cloudflare/migrations");

function readMigrationFiles() {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith(".sql"))
		.sort((left, right) => left.localeCompare(right))
		.map((name) => ({
			name,
			sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
		}));
}

function tableColumns(sqlite, tableName) {
	return sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

describe("migration chain", () => {
	test("applies cleanly on a fresh database and yields the expected columns", () => {
		const sqlite = new Database(":memory:");
		const migrations = readMigrationFiles();

		for (let i = 0; i < migrations.length; i++) {
			expect(() => sqlite.exec(migrations[i].sql)).not.toThrow();
		}

		const entryColumns = tableColumns(sqlite, "entries");
		const tripleColumns = tableColumns(sqlite, "triples");

		expect(entryColumns).toContain("knowledge_type");
		expect(entryColumns).toContain("memory_type");
		expect(entryColumns).toContain("valid_to_state");
		expect(entryColumns).toContain("embedding_status");
		expect(entryColumns).toContain("embedding_retry_count");
		expect(entryColumns).toContain("embedding_last_error");
		expect(entryColumns).toContain("embedding_last_attempt_at");
		expect(entryColumns).toContain("expires_at");
		expect(tripleColumns).toContain("valid_to_state");
	});
});
