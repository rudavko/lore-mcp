/**
 * @implements FR-001 — Search D1 operations: FTS5, LIKE fallback, graph neighbor, entry fetch.
 *
 * NOTE: whereClause params are built by internal pure helpers (buildQueryConditions etc.),
 * never from raw user input. User values are always passed via parameterized binds.
 */
/** Sentinel for TDD hook. */
export const _MODULE = "search.efct";
/** FTS5 full-text search. Caller provides pre-sanitized MATCH query. */
export async function fts5SearchRows(db, matchQuery, limit) {
	const { results } = await db
		.prepare(`SELECT e.id, bm25(entries_fts) AS rank
		 FROM entries_fts fts
		 JOIN entries e ON e.rowid = fts.rowid
		 WHERE entries_fts MATCH ?
		 AND e.deleted_at IS NULL
		 AND (e.expires_at IS NULL OR datetime(e.expires_at) > datetime('now') OR (e.knowledge_type = 'hypothesis' AND e.status = 'refuted'))
		 ORDER BY rank
		 LIMIT ?`)
		.bind(matchQuery, limit)
		.all();
	return results;
}
/** LIKE-based fallback search. whereClause is built by pure helpers; user values in binds. */
export async function likeSearchRows(db, whereClause, binds, limit) {
	const sql = `SELECT DISTINCT id, topic, content FROM entries
		 WHERE deleted_at IS NULL
		 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now') OR (knowledge_type = 'hypothesis' AND status = 'refuted'))
		 AND ${whereClause}
		 ORDER BY created_at DESC LIMIT ?`;
	const allBinds = [...binds, limit];
	const { results } = await db
		.prepare(sql)
		.bind(...allBinds)
		.all();
	return results;
}
/** Graph neighbor query. whereClause is built by orch layer; user values in binds. */
export async function graphNeighborRows(db, whereClause, binds) {
	const sql = `SELECT subject, object FROM triples WHERE ${whereClause}`;
	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all();
	return results;
}
/** Fetch full entry rows. whereClause is built by orch layer; user values in binds. */
export async function selectEntriesByIds(db, whereClause, binds) {
	const sql = `SELECT * FROM entries WHERE ${whereClause}`;
	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all();
	return results;
}
