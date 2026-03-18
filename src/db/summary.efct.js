/** @implements FR-019, NFR-005 — Raw summary/health overview data queries from D1. */
export async function querySummaryCounts(db) {
	return db.batch([
		db.prepare(`
			SELECT 'entries' as t, COUNT(*) as c FROM entries WHERE deleted_at IS NULL
			UNION ALL
			SELECT 'triples', COUNT(*) FROM triples WHERE deleted_at IS NULL
			UNION ALL
			SELECT 'entities', COUNT(*) FROM canonical_entities
		`),
		db.prepare(
			`SELECT topic FROM entries WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`,
		),
		db.prepare(
			`SELECT subject, predicate, object FROM triples WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`,
		),
		db.prepare(
			`SELECT tags FROM entries WHERE deleted_at IS NULL AND tags != '[]' ORDER BY created_at DESC LIMIT 200`,
		),
	]);
}
