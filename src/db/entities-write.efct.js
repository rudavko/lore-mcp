/** @implements FR-001 — Entity write-side D1 operations for canonical entities and aliases. */
export async function insertEntityRow({ db, txId, entityId, name, aliasId, afterSnapshot, now }) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'entity', ?, NULL, ?, ?)`)
			.bind(txId, entityId, afterSnapshot, now),
		db
			.prepare(`INSERT INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`)
			.bind(entityId, name, now),
		db
			.prepare(
				`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
			)
			.bind(aliasId, name.toLowerCase(), entityId, now),
	]);
}
export async function insertAliasRow({ db, txId, aliasId, alias, entityId, afterSnapshot, now }) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'alias', ?, NULL, ?, ?)`)
			.bind(txId, aliasId, afterSnapshot, now),
		db
			.prepare(
				`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
			)
			.bind(aliasId, alias, entityId, now),
	]);
}
export async function deleteEntityRow(db, id) {
	await db.prepare(`DELETE FROM canonical_entities WHERE id = ?`).bind(id).run();
}
export async function bulkReassignTripleSubject(db, newSubject, oldSubject) {
	await db
		.prepare(`UPDATE triples SET subject = ? WHERE subject = ? AND deleted_at IS NULL`)
		.bind(newSubject, oldSubject)
		.run();
}
export async function bulkReassignTripleObject(db, newObject, oldObject) {
	await db
		.prepare(`UPDATE triples SET object = ? WHERE object = ? AND deleted_at IS NULL`)
		.bind(newObject, oldObject)
		.run();
}
export async function bulkReassignEntries(db, newEntityId, oldEntityId) {
	await db
		.prepare(`UPDATE entries SET canonical_entity_id = ? WHERE canonical_entity_id = ?`)
		.bind(newEntityId, oldEntityId)
		.run();
}
export async function bulkReassignAliases(db, newEntityId, oldEntityId) {
	await db
		.prepare(`UPDATE entity_aliases SET canonical_entity_id = ? WHERE canonical_entity_id = ?`)
		.bind(newEntityId, oldEntityId)
		.run();
}
export async function insertAliasIgnore({ db, aliasId, alias, entityId, now }) {
	await db
		.prepare(
			`INSERT OR IGNORE INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
		)
		.bind(aliasId, alias, entityId, now)
		.run();
}
