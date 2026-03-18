/** @implements FR-001 — Entity read/query-side D1 operations for canonical entities and aliases. */
export async function selectEntityRow(db, id) {
	return db.prepare(`SELECT * FROM canonical_entities WHERE id = ?`).bind(id).first();
}
export async function selectEntityByName(db, name) {
	return db.prepare(`SELECT * FROM canonical_entities WHERE name = ?`).bind(name).first();
}
export async function resolveAliasRow(db, normalizedAlias) {
	return db
		.prepare(`SELECT ce.* FROM canonical_entities ce
		 JOIN entity_aliases ea ON ea.canonical_entity_id = ce.id
		 WHERE LOWER(ea.alias) = ?
		 LIMIT 1`)
		.bind(normalizedAlias)
		.first();
}
export async function selectTripleIdsBySubject(db, subject) {
	const { results } = await db
		.prepare(`SELECT id FROM triples WHERE subject = ? AND deleted_at IS NULL`)
		.bind(subject)
		.all();
	return results;
}
export async function selectTripleIdsByObject(db, object) {
	const { results } = await db
		.prepare(`SELECT id FROM triples WHERE object = ? AND deleted_at IS NULL`)
		.bind(object)
		.all();
	return results;
}
export async function selectEntryIdsByEntity(db, entityId) {
	const { results } = await db
		.prepare(`SELECT id FROM entries WHERE canonical_entity_id = ? AND deleted_at IS NULL`)
		.bind(entityId)
		.all();
	return results;
}
export async function selectAliasIdsByEntity(db, entityId) {
	const { results } = await db
		.prepare(`SELECT id FROM entity_aliases WHERE canonical_entity_id = ?`)
		.bind(entityId)
		.all();
	return results;
}
export async function queryCanonicalEntityRows(db, whereClause, binds, limit) {
	const sql = `SELECT ce.id, ce.name, ce.created_at FROM canonical_entities ce WHERE ${whereClause} ORDER BY ce.id DESC LIMIT ?`;
	const { results } = await db
		.prepare(sql)
		.bind(...binds, limit)
		.all();
	return results;
}
export async function queryAliasRowsByEntityIds(db, entityIds) {
	if (entityIds.length === 0) {
		return [];
	}
	const placeholders = entityIds.map(() => "?").join(",");
	const sql = `SELECT canonical_entity_id, alias FROM entity_aliases WHERE canonical_entity_id IN (${placeholders}) ORDER BY alias ASC`;
	const { results } = await db
		.prepare(sql)
		.bind(...entityIds)
		.all();
	return results;
}
