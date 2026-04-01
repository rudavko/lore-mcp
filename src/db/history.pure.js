/** @implements FR-008, NFR-001 — Thin export surface for history query and undo helpers. */

import {
	rowToTransaction as rowToTransactionImpl,
	buildHistoryQueryConditions as buildHistoryQueryConditionsImpl,
} from "./history-query.pure.js";
import { buildUndoStatements as buildUndoStatementsImpl } from "./history-undo.pure.js";

export function rowToTransaction(row) {
	return rowToTransactionImpl(row);
}

export function buildHistoryQueryConditions(params, decodedCursor) {
	return buildHistoryQueryConditionsImpl(params, decodedCursor);
}

export function buildUndoStatements(input) {
	return buildUndoStatementsImpl(input);
}
