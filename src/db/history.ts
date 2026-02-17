// GEMINI-CONTEXT: Transaction history and undo operations. Part of a planned
// restructure splitting monolithic db.ts into db/*.ts modules. The undo logic
// restores ALL fields including subject for triples. Tags are stored as string[]
// in snapshots and re-stringified for the DB column (which stores JSON text).

import { ulid, sqliteNow } from "../lib/ulid";
import type { Transaction } from "../lib/types";

export async function undoTransactions(
	db: D1Database,
	count: number = 1,
): Promise<string[]> {
	const { results: txns } = await db.prepare(
		`SELECT * FROM transactions
		 WHERE op != 'REVERT' AND reverted_by IS NULL
		 ORDER BY created_at DESC, id DESC LIMIT ?`,
	).bind(count).all();

	const revertedIds: string[] = [];

	for (const tx of txns) {
		const op = tx.op as string;
		const entityType = tx.entity_type as string;
		const entityId = tx.entity_id as string;
		const before = tx.before_snapshot as string | null;
		const after = tx.after_snapshot as string | null;
		const txId = tx.id as string;
		const now = sqliteNow();
		const revertId = ulid();

		const table = entityType === "entry" ? "entries" : "triples";

		const stmts: D1PreparedStatement[] = [
			db.prepare(
				`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
				 VALUES (?, 'REVERT', ?, ?, ?, ?, ?)`,
			).bind(revertId, entityType, entityId, after, before, now),
			db.prepare(
				`UPDATE transactions SET reverted_by = ? WHERE id = ?`,
			).bind(revertId, txId),
		];

		if (op === "CREATE") {
			stmts.push(
				db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`).bind(now, entityId),
			);
		} else if (op === "DELETE") {
			stmts.push(
				db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).bind(entityId),
			);
		} else if (op === "UPDATE" && before) {
			const snap = JSON.parse(before);
			if (entityType === "entry") {
				// snap.tags is string[] from the snapshot; DB column stores JSON string
				const tagsJson = Array.isArray(snap.tags) ? JSON.stringify(snap.tags) : (snap.tags ?? "[]");
				stmts.push(
					db.prepare(
						`UPDATE entries SET topic = ?, content = ?, tags = ?, source = ?, actor = ?, confidence = ?, updated_at = ? WHERE id = ?`,
					).bind(snap.topic, snap.content, tagsJson, snap.source ?? null, snap.actor ?? null, snap.confidence ?? null, snap.updated_at, entityId),
				);
			} else if (entityType === "triple") {
				// Restore all triple fields including subject
				stmts.push(
					db.prepare(
						`UPDATE triples SET subject = ?, predicate = ?, object = ?, source = ?, actor = ?, confidence = ? WHERE id = ?`,
					).bind(snap.subject, snap.predicate, snap.object, snap.source ?? null, snap.actor ?? null, snap.confidence ?? null, entityId),
				);
			}
		} else if (op === "MERGE" && before) {
			// GEMINI-CONTEXT: Full undo of mergeEntities() (Phase 3.10). The
			// before_snapshot stores {keep_id, keep_name, merge_id, merge_name,
			// merge_created_at, subj_triple_ids, obj_triple_ids, merge_entry_ids,
			// merge_alias_ids}. mergeEntities() performs 7 ops: (1) record txn,
			// (2) reassign subject triples, (3) reassign object triples,
			// (4) reassign entries, (5) move aliases, (6) create alias,
			// (7) delete merged entity. This undo reverses ops 2-7. ALL reversals
			// use per-ID updates from the stored IDs so we only touch rows that
			// were actually reassigned (not pre-existing ones on the keep entity).
			const snap = JSON.parse(before);
			if (snap.keep_id && snap.merge_id && snap.keep_name && snap.merge_name) {
				// 1. Restore the deleted canonical entity (preserve original created_at)
				stmts.push(
					db.prepare(`INSERT OR IGNORE INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`)
						.bind(snap.merge_id, snap.merge_name, snap.merge_created_at ?? now),
				);
				// 2. Reverse triple subject reassignments (per-ID)
				if (Array.isArray(snap.subj_triple_ids)) {
					for (const tripleId of snap.subj_triple_ids) {
						stmts.push(
							db.prepare(`UPDATE triples SET subject = ? WHERE id = ? AND subject = ?`)
								.bind(snap.merge_name, tripleId, snap.keep_name),
						);
					}
				}
				// 3. Reverse triple object reassignments (per-ID)
				if (Array.isArray(snap.obj_triple_ids)) {
					for (const tripleId of snap.obj_triple_ids) {
						stmts.push(
							db.prepare(`UPDATE triples SET object = ? WHERE id = ? AND object = ?`)
								.bind(snap.merge_name, tripleId, snap.keep_name),
						);
					}
				}
				// 4. Reverse entry reassignment (per-ID)
				if (Array.isArray(snap.merge_entry_ids)) {
					for (const entryId of snap.merge_entry_ids) {
						stmts.push(
							db.prepare(`UPDATE entries SET canonical_entity_id = ? WHERE id = ? AND canonical_entity_id = ?`)
								.bind(snap.merge_id, entryId, snap.keep_id),
						);
					}
				}
				// 5. Move merged entity's aliases back (per-ID)
				if (Array.isArray(snap.merge_alias_ids)) {
					for (const aliasId of snap.merge_alias_ids) {
						stmts.push(
							db.prepare(`UPDATE entity_aliases SET canonical_entity_id = ? WHERE id = ? AND canonical_entity_id = ?`)
								.bind(snap.merge_id, aliasId, snap.keep_id),
						);
					}
				}
				// 6. Remove the merge-created alias
				stmts.push(
					db.prepare(`DELETE FROM entity_aliases WHERE canonical_entity_id = ? AND alias = ?`)
						.bind(snap.keep_id, snap.merge_name.toLowerCase()),
				);
			}
		}

		await db.batch(stmts);
		revertedIds.push(txId);
	}

	return revertedIds;
}

export async function getHistory(
	db: D1Database,
	params: { limit?: number; entity_type?: string },
): Promise<Transaction[]> {
	const limit = params.limit ?? 20;
	const conditions: string[] = [];
	const binds: unknown[] = [];

	if (params.entity_type) {
		conditions.push("entity_type = ?");
		binds.push(params.entity_type);
	}

	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const sql = `SELECT * FROM transactions ${where} ORDER BY created_at DESC, id DESC LIMIT ?`;
	binds.push(limit);

	const stmt = db.prepare(sql).bind(...binds);
	const { results } = await stmt.all();

	return results.map((r) => ({
		id: r.id as string,
		op: r.op as string,
		entity_type: r.entity_type as string,
		entity_id: r.entity_id as string,
		before_snapshot: r.before_snapshot as string | null,
		after_snapshot: r.after_snapshot as string | null,
		reverted_by: (r.reverted_by as string) ?? null,
		created_at: r.created_at as string,
	}));
}
