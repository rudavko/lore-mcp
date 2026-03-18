/** @implements NFR-001 — Shared SQLite-backed D1 fixtures for DB-layer tests. */
import { Database } from "bun:sqlite";
import { initSchema } from "../db/schema.efct.js";

function createLazyStatement(sqliteDb, sql) {
	return {
		bind: (...args) => ({
			run: () => {
				sqliteDb.prepare(sql).run(...args);
				return { success: true, meta: {} };
			},
			all: () => ({ results: sqliteDb.prepare(sql).all(...args) }),
			first: () => sqliteDb.prepare(sql).get(...args),
		}),
		run: () => {
			sqliteDb.prepare(sql).run();
			return { success: true, meta: {} };
		},
		all: () => ({ results: sqliteDb.prepare(sql).all() }),
		first: () => sqliteDb.prepare(sql).get(),
	};
}

function runBatchStatements(statements) {
	for (const statement of statements) {
		statement.run();
	}
	return [];
}

function collectBatchAllResults(statements) {
	const results = [];
	for (const statement of statements) {
		results.push(statement.all());
	}
	return results;
}

export function createSqliteMemoryDb() {
	return new Database(":memory:");
}

export function createD1(options) {
	const sqliteDb = options.sqliteDb;
	const batchMode = options.batchMode || "run";
	return {
		prepare: (sql) => createLazyStatement(sqliteDb, sql),
		batch: async (statements) =>
			batchMode === "all" ? collectBatchAllResults(statements) : runBatchStatements(statements),
		exec: async (sql) => {
			sqliteDb.exec(sql);
			return { count: 0, duration: 0 };
		},
		dump: async () => new globalThis.ArrayBuffer(0),
	};
}

export async function createInitializedD1(options = {}) {
	const sqlite = options.sqliteDb || createSqliteMemoryDb();
	const db = createD1({ sqliteDb: sqlite, batchMode: options.batchMode });
	await initSchema(db);
	return { sqlite, db };
}
