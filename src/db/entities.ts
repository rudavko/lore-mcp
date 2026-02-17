// GEMINI-CONTEXT: Canonical entity management with alias resolution and merge
// (Spec 003). upsertEntity uses exact-only match to avoid fuzzy collisions.
// mergeEntities uses bulk WHERE-clause UPDATEs (not per-ID) to stay within a
// single atomic db.batch() call and avoid D1's 100-statement limit.

import { ulid, sqliteNow } from "../lib/ulid";
import { KnowledgeError } from "../lib/errors";
import { escapeLike } from "../lib/format";
import type { CanonicalEntity, EntityAlias } from "../lib/types";

export async function createEntity(
	db: D1Database,
	name: string,
): Promise<CanonicalEntity> {
	const id = ulid();
	const now = sqliteNow();

	const entity: CanonicalEntity = { id, name, created_at: now };

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'entity', ?, NULL, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(entity), now),
		db.prepare(
			`INSERT INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`,
		).bind(id, name, now),
		// Auto-create alias matching the canonical name
		db.prepare(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
		).bind(ulid(), name.toLowerCase(), id, now),
	]);

	return entity;
}

export async function addAlias(
	db: D1Database,
	entityId: string,
	alias: string,
): Promise<EntityAlias> {
	const entity = await db.prepare(
		`SELECT id FROM canonical_entities WHERE id = ?`,
	).bind(entityId).first();

	if (!entity) throw KnowledgeError.notFound("Entity", entityId);

	const id = ulid();
	const now = sqliteNow();
	const normalized = alias.toLowerCase();

	const record: EntityAlias = { id, alias: normalized, canonical_entity_id: entityId, created_at: now };

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'alias', ?, NULL, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(record), now),
		db.prepare(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
		).bind(id, normalized, entityId, now),
	]);

	return record;
}

/** Exact-match alias resolution (case-insensitive). Used by upsertEntity to avoid fuzzy collisions. */
async function resolveAliasExact(
	db: D1Database,
	name: string,
): Promise<CanonicalEntity | null> {
	const normalized = name.toLowerCase();

	const row = await db.prepare(
		`SELECT ce.* FROM canonical_entities ce
		 JOIN entity_aliases ea ON ea.canonical_entity_id = ce.id
		 WHERE LOWER(ea.alias) = ?
		 LIMIT 1`,
	).bind(normalized).first();

	if (!row) return null;

	return {
		id: row.id as string,
		name: row.name as string,
		created_at: row.created_at as string,
	};
}

/** Fuzzy alias resolution: tries exact match first, then falls back to LIKE. */
export async function resolveAlias(
	db: D1Database,
	name: string,
): Promise<CanonicalEntity | null> {
	// Exact match first (fast path)
	const exact = await resolveAliasExact(db, name);
	if (exact) return exact;

	// Fuzzy fallback: case-insensitive LIKE (escapeLike prevents wildcard injection)
	const normalized = name.toLowerCase();
	const row = await db.prepare(
		`SELECT ce.* FROM canonical_entities ce
		 JOIN entity_aliases ea ON ea.canonical_entity_id = ce.id
		 WHERE LOWER(ea.alias) LIKE ? ESCAPE '\\'
		 LIMIT 1`,
	).bind(`%${escapeLike(normalized)}%`).first();

	if (!row) return null;

	return {
		id: row.id as string,
		name: row.name as string,
		created_at: row.created_at as string,
	};
}

/** Create or resolve entity by exact alias match only (no fuzzy collisions). */
export async function upsertEntity(
	db: D1Database,
	name: string,
): Promise<{ entity: CanonicalEntity; created: boolean }> {
	const existing = await resolveAliasExact(db, name);
	if (existing) return { entity: existing, created: false };
	const entity = await createEntity(db, name);
	return { entity, created: true };
}

export async function mergeEntities(
	db: D1Database,
	keepId: string,
	mergeId: string,
): Promise<{ merged_count: number }> {
	if (keepId === mergeId) throw KnowledgeError.validation("Cannot merge entity with itself");

	const keepEntity = await db.prepare(
		`SELECT * FROM canonical_entities WHERE id = ?`,
	).bind(keepId).first();
	if (!keepEntity) throw KnowledgeError.notFound("Entity", keepId);

	const mergeEntity = await db.prepare(
		`SELECT * FROM canonical_entities WHERE id = ?`,
	).bind(mergeId).first();
	if (!mergeEntity) throw KnowledgeError.notFound("Entity", mergeId);

	const keepName = keepEntity.name as string;
	const mergeName = mergeEntity.name as string;
	const now = sqliteNow();

	// Capture affected triple IDs before mutation (needed for undo).
	// Query subject-affected and object-affected separately so undo can
	// reverse them independently without mixing up which side was changed.
	const { results: subjTriples } = await db.prepare(
		`SELECT id FROM triples WHERE subject = ? AND deleted_at IS NULL`,
	).bind(mergeName).all();
	const { results: objTriples } = await db.prepare(
		`SELECT id FROM triples WHERE object = ? AND deleted_at IS NULL`,
	).bind(mergeName).all();
	// GEMINI-CONTEXT: Capture ALL affected IDs before mutation so undo can
	// reverse per-ID instead of bulk WHERE. Bulk reversal would incorrectly
	// move keep's own entries/aliases to merge. IDs stored in before_snapshot
	// and used by history.ts MERGE undo for per-ID reversal.
	const { results: mergeEntries } = await db.prepare(
		`SELECT id FROM entries WHERE canonical_entity_id = ? AND deleted_at IS NULL`,
	).bind(mergeId).all();
	const { results: mergeAliases } = await db.prepare(
		`SELECT id FROM entity_aliases WHERE canonical_entity_id = ?`,
	).bind(mergeId).all();
	const subjTripleIds = subjTriples.map((r) => r.id as string);
	const objTripleIds = objTriples.map((r) => r.id as string);
	const mergeEntryIds = mergeEntries.map((r) => r.id as string);
	const mergeAliasIds = mergeAliases.map((r) => r.id as string);
	const mergedCount = new Set([...subjTripleIds, ...objTripleIds]).size;

	// All mutations in a single atomic batch using bulk WHERE-clause UPDATEs.
	// No per-ID statements — stays well under D1's 100-statement batch limit.
	await db.batch([
		// Record transaction with before-snapshot for undo
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'MERGE', 'entity', ?, ?, ?, ?)`,
		).bind(
			ulid(),
			keepId,
			JSON.stringify({
				keep_id: keepId,
				keep_name: keepName,
				merge_id: mergeId,
				merge_name: mergeName,
				merge_created_at: mergeEntity.created_at as string,
				subj_triple_ids: subjTripleIds,
				obj_triple_ids: objTripleIds,
				merge_entry_ids: mergeEntryIds,
				merge_alias_ids: mergeAliasIds,
			}),
			JSON.stringify({ keep_id: keepId, merged_name: mergeName }),
			now,
		),
		// Bulk reassign subject triples
		db.prepare(
			`UPDATE triples SET subject = ? WHERE subject = ? AND deleted_at IS NULL`,
		).bind(keepName, mergeName),
		// Bulk reassign object triples
		db.prepare(
			`UPDATE triples SET object = ? WHERE object = ? AND deleted_at IS NULL`,
		).bind(keepName, mergeName),
		// Reassign entries linked to merged entity
		db.prepare(
			`UPDATE entries SET canonical_entity_id = ? WHERE canonical_entity_id = ?`,
		).bind(keepId, mergeId),
		// Move aliases from merged entity to keep entity
		db.prepare(
			`UPDATE entity_aliases SET canonical_entity_id = ? WHERE canonical_entity_id = ?`,
		).bind(keepId, mergeId),
		// Create alias from merged entity's name to keep entity
		db.prepare(
			`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
		).bind(ulid(), mergeName.toLowerCase(), keepId, now),
		// Delete the merged entity record
		db.prepare(
			`DELETE FROM canonical_entities WHERE id = ?`,
		).bind(mergeId),
	]);

	return { merged_count: mergedCount };
}
