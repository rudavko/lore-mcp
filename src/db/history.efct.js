/** @implements FR-008, NFR-001 — Effects boundary for history query and batch execution. */
/** Sentinel for TDD hook. */
export const _MODULE = "history.efct";
/** Query transactions with a pre-built SQL fragment. Caller provides full WHERE clause or empty string. */
export async function queryTransactionRows(db, sql, binds) {
	const { results } = await db
		.prepare(sql)
		.bind(...binds)
		.all();
	return results;
}
export async function selectRevertableTransactions(db, count) {
	const { results } = await db
		.prepare(`SELECT * FROM transactions
		 WHERE op != 'REVERT' AND reverted_by IS NULL
		 ORDER BY created_at DESC, id DESC LIMIT ?`)
		.bind(count)
		.all();
	return results;
}
/** Execute statement descriptors in a single D1 batch. Accepts up to 10 descriptors. */
export async function executeBatch(db, stmts) {
	await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...s.binds)));
}
