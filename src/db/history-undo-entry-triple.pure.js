/** @implements FR-008 — Undo strategies for entry/triple create, delete, and update flows. */
import { asString, serializeTags } from "./history-undo-shared.pure.js";

function buildCreatedEntryAliasUndoStatements({ entityId, afterSnapshot }) {
	const stmts = [];
	const autoCreated =
		afterSnapshot._auto_link_auto_created === true ||
		afterSnapshot._auto_link_entity_created === true;
	const canonicalEntityId = asString(afterSnapshot.canonical_entity_id);
	const aliasCreated =
		afterSnapshot._auto_link_alias_created === true || autoCreated;
	const canonicalAlias = asString(afterSnapshot._auto_link_alias);
	const fallbackAlias =
		asString(afterSnapshot._auto_link_entity_name)?.toLowerCase() ?? null;
	const canonicalAliasId = asString(afterSnapshot._auto_link_alias_id);

	if (
		aliasCreated &&
		canonicalEntityId !== null &&
		(canonicalAlias !== null || fallbackAlias !== null)
	) {
		const aliasValue = canonicalAlias ?? fallbackAlias ?? "";
		if (canonicalAliasId !== null) {
			stmts.push({
				sql: `DELETE FROM entity_aliases WHERE id = ? AND canonical_entity_id = ? AND alias = ?`,
				binds: [canonicalAliasId, canonicalEntityId, aliasValue],
			});
		} else {
			stmts.push({
				sql: `DELETE FROM entity_aliases WHERE canonical_entity_id = ? AND alias = ?`,
				binds: [canonicalEntityId, aliasValue],
			});
		}
	}

	if (autoCreated && canonicalEntityId !== null) {
		stmts.push({
			sql: `DELETE FROM canonical_entities
				 WHERE id = ?
				   AND NOT EXISTS (
					   SELECT 1 FROM entries
					    WHERE canonical_entity_id = ?
					      AND deleted_at IS NULL
					      AND id <> ?
				   )
				   AND NOT EXISTS (
					   SELECT 1 FROM entity_aliases
					    WHERE canonical_entity_id = ?
				   )`,
			binds: [canonicalEntityId, canonicalEntityId, entityId, canonicalEntityId],
		});
	}

	return stmts;
}

function buildUndoCreateStatements({ entityType, table, entityId, now, afterSnapshot }) {
	const stmts = [
		{
			sql: `UPDATE ${table} SET deleted_at = ? WHERE id = ?`,
			binds: [now, entityId],
		},
	];
	if (entityType === "entry" && afterSnapshot !== null) {
		return [...stmts, ...buildCreatedEntryAliasUndoStatements({ entityId, afterSnapshot })];
	}
	return stmts;
}

function buildUndoDeleteStatements({ table, entityId }) {
	return [
		{
			sql: `UPDATE ${table} SET deleted_at = NULL WHERE id = ?`,
			binds: [entityId],
		},
	];
}

function buildEntryUpdateUndoStatement({ entityId, snapshot }) {
	const tags = typeof snapshot.tags === "string" ? snapshot.tags : serializeTags(snapshot.tags);
	return {
		sql: `UPDATE entries SET topic = ?, content = ?, tags = ?, source = ?, actor = ?, confidence = ?, knowledge_type = ?, memory_type = ?, status = ?, valid_from = ?, valid_to = ?, valid_to_state = ?, expires_at = ?, canonical_entity_id = ?, updated_at = ? WHERE id = ?`,
		binds: [
			snapshot.topic,
			snapshot.content,
			tags,
			snapshot.source ?? null,
			snapshot.actor ?? null,
			snapshot.confidence ?? null,
			snapshot.knowledge_type ?? "observation",
			snapshot.memory_type ?? "fleeting",
			snapshot.status ?? "active",
			snapshot.valid_from ?? null,
			snapshot.valid_to ?? null,
			snapshot.valid_to_state ?? "unspecified",
			snapshot.expires_at ?? null,
			snapshot.canonical_entity_id ?? null,
			snapshot.updated_at,
			entityId,
		],
	};
}

function buildTripleUpdateUndoStatement({ entityId, snapshot }) {
	return {
		sql: `UPDATE triples SET subject = ?, predicate = ?, object = ?, source = ?, actor = ?, confidence = ? WHERE id = ?`,
		binds: [
			snapshot.subject,
			snapshot.predicate,
			snapshot.object,
			snapshot.source ?? null,
			snapshot.actor ?? null,
			snapshot.confidence ?? null,
			entityId,
		],
	};
}

function buildUndoUpdateStatements({ entityType, entityId, beforeSnapshot }) {
	if (beforeSnapshot === null) {
		return [];
	}
	if (entityType === "entry") {
		return [buildEntryUpdateUndoStatement({ entityId, snapshot: beforeSnapshot })];
	}
	if (entityType === "triple") {
		return [buildTripleUpdateUndoStatement({ entityId, snapshot: beforeSnapshot })];
	}
	return [];
}

export {
	buildUndoCreateStatements,
	buildUndoDeleteStatements,
	buildUndoUpdateStatements,
};
