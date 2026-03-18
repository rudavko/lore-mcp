/** @implements FR-008 — Undo strategies for canonical-entity merge reverts. */
import {
	asString,
	asStringArray,
	buildDeleteMergeAliasSql,
	buildIdScopedUpdate,
} from "./history-undo-shared.pure.js";

function buildUndoMergeRestoreStatements({
	mergeName,
	keepName,
	mergeId,
	mergeEntryIds,
	mergeAliasIds,
	subjTripleIds,
	objTripleIds,
}) {
	const stmts = [];
	if (mergeName !== null && keepName !== null) {
		const subjectRestore = buildIdScopedUpdate({
			table: "triples",
			column: "subject",
			value: mergeName,
			currentValue: keepName,
			ids: subjTripleIds,
		});
		if (subjectRestore !== null) {
			stmts.push(subjectRestore);
		}
		const objectRestore = buildIdScopedUpdate({
			table: "triples",
			column: "object",
			value: mergeName,
			currentValue: keepName,
			ids: objTripleIds,
		});
		if (objectRestore !== null) {
			stmts.push(objectRestore);
		}
	}
	if (mergeId !== null) {
		const entryRestore = buildIdScopedUpdate({
			table: "entries",
			column: "canonical_entity_id",
			value: mergeId,
			currentValue: null,
			ids: mergeEntryIds,
		});
		if (entryRestore !== null) {
			stmts.push(entryRestore);
		}
		const aliasRestore = buildIdScopedUpdate({
			table: "entity_aliases",
			column: "canonical_entity_id",
			value: mergeId,
			currentValue: null,
			ids: mergeAliasIds,
		});
		if (aliasRestore !== null) {
			stmts.push(aliasRestore);
		}
	}
	return stmts;
}

function buildUndoMergeStatements(beforeSnapshot) {
	if (beforeSnapshot === null) {
		return [];
	}
	const keepId = asString(beforeSnapshot.keep_id);
	const keepName = asString(beforeSnapshot.keep_name);
	const mergeId = asString(beforeSnapshot.merge_id);
	const mergeName = asString(beforeSnapshot.merge_name);
	const mergeCreatedAt = asString(beforeSnapshot.merge_created_at);
	const subjTripleIds = asStringArray(beforeSnapshot.subj_triple_ids);
	const objTripleIds = asStringArray(beforeSnapshot.obj_triple_ids);
	const mergeEntryIds = asStringArray(beforeSnapshot.merge_entry_ids);
	const mergeAliasIds = asStringArray(beforeSnapshot.merge_alias_ids);
	const stmts = [];

	if (mergeId !== null && mergeName !== null && mergeCreatedAt !== null) {
		stmts.push({
			sql: `INSERT OR IGNORE INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`,
			binds: [mergeId, mergeName, mergeCreatedAt],
		});
	}

	stmts.push(
		...buildUndoMergeRestoreStatements({
			mergeName,
			keepName,
			mergeId,
			mergeEntryIds,
			mergeAliasIds,
			subjTripleIds,
			objTripleIds,
		}),
	);

	if (mergeName !== null && keepId !== null) {
		stmts.push({
			sql: buildDeleteMergeAliasSql(mergeAliasIds.length),
			binds:
				mergeAliasIds.length > 0
					? [mergeName.toLowerCase(), keepId, ...mergeAliasIds]
					: [mergeName.toLowerCase(), keepId],
		});
	}

	return stmts;
}

export { buildUndoMergeStatements };
