/** @implements FR-001 — Conflict-related runtime assembly for MCP server configuration. */
import {
	computeExpiresAt,
	jsonStringifyOrNull,
	nowIso,
	parseConflictRow,
} from "./runtime-value-helpers.orch.3.js";

function createConflictOps({ deps, std, db, generateId, findActiveTriples }) {
	const conflictSave = deps.makeSaveConflict({
		savePendingConflictRow: deps.savePendingConflictRow,
		computeExpiresAt: (startIso, ttlMs) => computeExpiresAt(startIso, ttlMs, std),
		serialize: (value) => jsonStringifyOrNull(value, std),
		now: () => nowIso(std),
		conflictTtlMs: deps.defaultConflictTtlMs,
		db,
	});
	const conflictLoadRow = deps.makeLoadConflictRow({
		loadPendingConflictRow: deps.loadPendingConflictRow,
		now: () => nowIso(std),
		db,
	});
	const conflictRemove = deps.makeRemoveConflict({
		removePendingConflictRow: deps.removePendingConflictRow,
		db,
	});
	const detectConflict = async (params) => {
		return await deps.detectConflictOrch(params, {
			findActiveTriples,
			generateId,
			findConflictingTriple: deps.findConflictingTriple,
			buildConflictInfo: deps.buildConflictInfo,
		});
	};
	const loadConflict = async (id) => {
		const row = await conflictLoadRow(id);
		if (row === null) {
			return null;
		}
		const parsed = parseConflictRow(row, deps.toConflictInfo, std);
		if (parsed === null) {
			await conflictRemove(id);
			return null;
		}
		return parsed;
	};
	return {
		conflictRemove,
		conflictSave,
		detectConflict,
		loadConflict,
	};
}

export { createConflictOps };
