/** @implements FR-001, FR-003 — Effects boundary for entry persistence and query operations. */
export async function insertEntryRow({
	db,
	txId,
	entryId,
	topic,
	content,
	tagsJson,
	source,
	actor,
	confidence,
	validFrom,
	validTo,
	validToState,
	expiresAt,
	knowledgeType,
	memoryType,
	status,
	canonicalEntityId,
	afterSnapshot,
	now,
	autoLinkPlan,
}) {
	const statements = [
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'entry', ?, NULL, ?, ?)`)
			.bind(txId, entryId, afterSnapshot, now),
	];
	if (autoLinkPlan && autoLinkPlan.entity_created) {
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`,
				)
				.bind(autoLinkPlan.entity_id, autoLinkPlan.entity_name, now),
		);
	}
	if (autoLinkPlan && autoLinkPlan.alias_created) {
		statements.push(
			db
				.prepare(`INSERT OR IGNORE INTO entity_aliases (id, alias, canonical_entity_id, created_at)
				 SELECT ?, ?, id, ? FROM canonical_entities WHERE name = ?`)
				.bind(
					autoLinkPlan.alias_id,
					autoLinkPlan.alias.toLowerCase(),
					now,
					autoLinkPlan.entity_name,
				),
		);
	}
	if (autoLinkPlan) {
		statements.push(
			db
				.prepare(`INSERT INTO entries (id, topic, content, tags, source, actor, confidence, valid_from, valid_to, valid_to_state, expires_at, knowledge_type, memory_type, status, canonical_entity_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM canonical_entities WHERE name = ?), ?, ?)`)
				.bind(
					entryId,
					topic,
					content,
					tagsJson,
					source,
					actor,
					confidence,
					validFrom,
					validTo,
					validToState,
					expiresAt,
					knowledgeType,
					memoryType,
					status,
					autoLinkPlan.entity_name,
					now,
					now,
				),
		);
	} else {
		statements.push(
			db
				.prepare(`INSERT INTO entries (id, topic, content, tags, source, actor, confidence, valid_from, valid_to, valid_to_state, expires_at, knowledge_type, memory_type, status, canonical_entity_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.bind(
					entryId,
					topic,
					content,
					tagsJson,
					source,
					actor,
					confidence,
					validFrom,
					validTo,
					validToState,
					expiresAt,
					knowledgeType,
					memoryType,
					status,
					canonicalEntityId,
					now,
					now,
				),
		);
	}
	await db.batch(statements);
}
export async function selectEntryRow(db, id) {
	return db
		.prepare(`SELECT * FROM entries
		 WHERE id = ?
		   AND deleted_at IS NULL`)
		.bind(id)
		.first();
}
export async function updateEntryRow({
	db,
	id,
	txId,
	topic,
	content,
	tagsJson,
	source,
	actor,
	confidence,
	validFrom,
	validTo,
	validToState,
	expiresAt,
	knowledgeType,
	memoryType,
	status,
	canonicalEntityId,
	beforeSnapshot,
	afterSnapshot,
	now,
}) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'UPDATE', 'entry', ?, ?, ?, ?)`)
			.bind(txId, id, beforeSnapshot, afterSnapshot, now),
		db
			.prepare(
				`UPDATE entries SET topic = ?, content = ?, tags = ?, source = ?, actor = ?, confidence = ?, valid_from = ?, valid_to = ?, valid_to_state = ?, expires_at = ?, knowledge_type = ?, memory_type = ?, status = ?, canonical_entity_id = ?, updated_at = ? WHERE id = ?`,
			)
			.bind(
				topic,
				content,
				tagsJson,
				source,
				actor,
				confidence,
				validFrom,
				validTo,
				validToState,
				expiresAt,
				knowledgeType,
				memoryType,
				status,
				canonicalEntityId,
				now,
				id,
			),
	]);
}
export async function softDeleteEntryRow({ db, id, txId, beforeSnapshot, now }) {
	await db.batch([
		db
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'DELETE', 'entry', ?, ?, NULL, ?)`)
			.bind(txId, id, beforeSnapshot, now),
		db.prepare(`UPDATE entries SET deleted_at = ? WHERE id = ?`).bind(now, id),
	]);
}
export async function queryEntryRows(db, whereClause, binds, limit) {
	const sql = `SELECT * FROM entries WHERE ${whereClause} ORDER BY id DESC LIMIT ?`;
	const allBinds = [...binds, limit];
	const { results } = await db
		.prepare(sql)
		.bind(...allBinds)
		.all();
	return results;
}
