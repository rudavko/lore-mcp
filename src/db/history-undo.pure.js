/** @implements FR-008 — Thin undo dispatcher over operation-specific undo strategies. */
import { buildRevertTransactionStatements } from "./history-undo-shared.pure.js";
import {
	buildUndoCreateStatements,
	buildUndoDeleteStatements,
	buildUndoUpdateStatements,
} from "./history-undo-entry-triple.pure.js";
import { buildUndoMergeStatements } from "./history-undo-merge.pure.js";

function buildEntryOrTripleUndoStatements({ op, entityType, entityId, now, beforeSnapshot, afterSnapshot }) {
	if (op === "CREATE") {
		const table = entityType === "entry" ? "entries" : "triples";
		return buildUndoCreateStatements({
			entityType,
			table,
			entityId,
			now,
			afterSnapshot,
		});
	}
	if (op === "DELETE") {
		const table = entityType === "entry" ? "entries" : "triples";
		return buildUndoDeleteStatements({ table, entityId });
	}
	if (op === "UPDATE") {
		return buildUndoUpdateStatements({ entityType, entityId, beforeSnapshot });
	}
	return [];
}

function buildOpSpecificUndoStatements(input) {
	if (input.entityType === "entry" || input.entityType === "triple") {
		return buildEntryOrTripleUndoStatements(input);
	}
	if (input.op === "MERGE" && input.entityType === "entity") {
		return buildUndoMergeStatements(input.beforeSnapshot);
	}
	return [];
}

function buildUndoStatements(input) {
	return [
		...buildRevertTransactionStatements(input),
		...buildOpSpecificUndoStatements(input),
	];
}

export { buildUndoStatements };
