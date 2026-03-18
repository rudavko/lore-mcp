/** @implements FR-001 — Triple D1 CRUD: thin boundary wrappers for insert, select, update, delete, query. */
/** Sentinel for TDD hook. */
export const _MODULE = "triples.efct";
export async function insertTripleRow({
	db,
	txId,
	tripleId,
	subject,
	predicate,
	object,
	source,
	actor,
	confidence,
	validFrom,
	validTo,
	validToState,
	afterSnapshot,
	now,
}) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'triple', ?, NULL, ?, ?)`)
			.bind(txId, tripleId, afterSnapshot, now),
		db
			.prepare(`INSERT INTO triples (id, subject, predicate, object, source, actor, confidence, valid_from, valid_to, valid_to_state, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
			.bind(
				tripleId,
				subject,
				predicate,
				object,
				source,
				actor,
				confidence,
				validFrom,
				validTo,
				validToState,
				now,
			),
	]);
}
export async function selectTripleRow(db, id) {
	return db.prepare(`SELECT * FROM triples WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
}
export async function updateTripleRow({
	db,
	id,
	txId,
	predicate,
	object,
	source,
	actor,
	confidence,
	validFrom,
	validTo,
	validToState,
	beforeSnapshot,
	afterSnapshot,
	now,
}) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'UPDATE', 'triple', ?, ?, ?, ?)`)
			.bind(txId, id, beforeSnapshot, afterSnapshot, now),
		db
			.prepare(
				`UPDATE triples SET predicate = ?, object = ?, source = ?, actor = ?, confidence = ?, valid_from = ?, valid_to = ?, valid_to_state = ? WHERE id = ?`,
			)
			.bind(
				predicate,
				object,
				source,
				actor,
				confidence,
				validFrom,
				validTo,
				validToState,
				id,
			),
	]);
}
export async function softDeleteTripleRow({ db, id, txId, beforeSnapshot, now }) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'DELETE', 'triple', ?, ?, NULL, ?)`)
			.bind(txId, id, beforeSnapshot, now),
		db.prepare(`UPDATE triples SET deleted_at = ? WHERE id = ?`).bind(now, id),
	]);
}
export async function queryTripleRows(db, whereClause, binds, limit) {
	const sql = `SELECT * FROM triples WHERE ${whereClause} ORDER BY id DESC LIMIT ?`;
	const allBinds = [...binds, limit];
	const { results } = await db
		.prepare(sql)
		.bind(...allBinds)
		.all();
	return results;
}
