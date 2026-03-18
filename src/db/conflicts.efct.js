/** @implements FR-001 — Conflict D1 operations: save, load, remove, sweep pending conflicts. */
/** Sentinel for TDD hook. */
export const _MODULE = "conflicts.efct";
export async function savePendingConflictRow({
	db,
	conflictId,
	scope,
	dataJson,
	expiresAt,
	createdAt,
}) {
	await db
		.prepare(
			`INSERT OR REPLACE INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(conflictId, scope, dataJson, createdAt, expiresAt)
		.run();
}
export async function loadPendingConflictRow(db, conflictId, nowIso) {
	return db
		.prepare(`SELECT * FROM conflicts WHERE conflict_id = ? AND expires_at > ? LIMIT 1`)
		.bind(conflictId, nowIso)
		.first();
}
export async function removePendingConflictRow(db, conflictId) {
	await db.prepare(`DELETE FROM conflicts WHERE conflict_id = ?`).bind(conflictId).run();
}
export async function sweepExpiredConflicts(db, nowIso) {
	await db.prepare(`DELETE FROM conflicts WHERE expires_at <= ?`).bind(nowIso).run();
}
