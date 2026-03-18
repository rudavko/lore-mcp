/** @implements FR-008, NFR-001 — Orchestration helpers for history queries and undo execution. */
/** Sentinel for TDD hook. */
export const _MODULE = "history.efct";
// CONTEXT: undoTransactions reverts each transaction one at a time. The loop body
// calls buildUndoStatements + executeBatch per transaction. parseSnapshot is a
// pre-composed dep that does JSON.parse, keeping this function's fan-out ≤ 7.
export async function undoTransactions(count, deps) {
	const rows = await deps.selectRevertableTransactions(deps.db, count);
	if (rows.length === 0) {
		return [];
	}
	const reverted = [];
	const timestamp = deps.now();
	for (let i = 0; i < rows.length; i++) {
		const tx = deps.rowToTransaction(rows[i]);
		const revertId = deps.generateId();
		await deps.revertTransaction(tx, revertId, timestamp);
		reverted.push(tx);
	}
	return reverted;
}
// CONTEXT: buildWhereClause is a pre-composed dep that calls buildHistoryQueryConditions
// and joins conditions + appends ORDER BY. This keeps fan-out ≤ 7.
export async function getHistory(params, deps) {
	const limit = params.limit || 20;
	const decodedCursor = deps.decodeCursor(params.cursor);
	const { sql, binds } = deps.buildSql(params, decodedCursor, limit + 1);
	const rows = await deps.queryTransactionRows(deps.db, sql, binds);
	const hasMore = rows.length > limit;
	const pageLen = hasMore ? limit : rows.length;
	const items = [];
	for (let i = 0; i < pageLen; i++) {
		items.push(deps.rowToTransaction(rows[i]));
	}
	let nextCursor = null;
	if (hasMore && pageLen > 0) {
		nextCursor = deps.encodeCursor(rows[pageLen - 1].id);
	}
	return { items, next_cursor: nextCursor };
}
