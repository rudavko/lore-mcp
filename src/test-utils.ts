// GEMINI-CONTEXT: Shared D1 mock for testing. Extracted from db.test.ts to avoid
// DRY violation (was duplicated in evals/run.ts). Uses SQLQueryBindings[] cast
// throughout to satisfy bun:sqlite's strict parameter typing while the D1Database
// interface uses unknown[] for bind params.

import { Database, type SQLQueryBindings } from "bun:sqlite";

/** Minimal D1Database adapter wrapping bun:sqlite in-memory DB for testing. */
export function createD1Mock(): D1Database {
	const sqlite = new Database(":memory:");

	function wrapStatement(sql: string, boundParams: SQLQueryBindings[] = []) {
		return {
			_sql: sql,
			_params: boundParams,
			bind(...params: unknown[]) {
				return wrapStatement(sql, params as SQLQueryBindings[]);
			},
			async first() {
				return sqlite.prepare(sql).get(...boundParams) ?? null;
			},
			async all() {
				const results = sqlite.prepare(sql).all(...boundParams);
				return { results, success: true, meta: {} };
			},
			async run() {
				sqlite.prepare(sql).run(...boundParams);
				return { success: true, meta: {} };
			},
			async raw() {
				return [];
			},
		} as unknown as D1PreparedStatement;
	}

	return {
		prepare(sql: string) {
			return wrapStatement(sql);
		},
		async batch(stmts: D1PreparedStatement[]) {
			const tx = sqlite.transaction(() => {
				const results = [];
				for (const stmt of stmts) {
					const s = stmt as unknown as { _sql: string; _params: SQLQueryBindings[] };
					sqlite.prepare(s._sql).run(...s._params);
					results.push({ success: true, meta: {} });
				}
				return results;
			});
			return tx();
		},
		async exec() {
			return { count: 0, duration: 0 };
		},
		dump() {
			return Promise.resolve(new ArrayBuffer(0));
		},
	} as unknown as D1Database;
}
