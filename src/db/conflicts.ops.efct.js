/** @implements FR-001 — Conflict save/load/remove: translates conflict records to/from D1 rows. */
/** Sentinel for TDD hook. */
export const _MODULE = "conflicts.efct";
export const makeSaveConflict = (deps) => {
	return async (conflict) => {
		const conflictId = conflict.conflict_id;
		const scope = conflict.scope;
		const dataJson = deps.serialize(conflict);
		const createdAt = deps.now();
		const expiresAt = deps.computeExpiresAt(createdAt, deps.conflictTtlMs);
		await deps.savePendingConflictRow({
			db: deps.db,
			conflictId,
			scope,
			dataJson,
			expiresAt,
			createdAt,
		});
	};
};
export const makeLoadConflictRow = (deps) => {
	return async (conflictId) => {
		return deps.loadPendingConflictRow(deps.db, conflictId, deps.now());
	};
};
export const makeRemoveConflict = (deps) => {
	return async (conflictId) => {
		await deps.removePendingConflictRow(deps.db, conflictId);
	};
};
