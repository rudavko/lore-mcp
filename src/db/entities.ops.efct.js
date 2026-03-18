/** @implements FR-003, NFR-001 — Entity orchestration for upsert, merge, and query flows. */
/** Sentinel for TDD hook. */
export const _MODULE = "entities.efct";
// CONTEXT: upsertEntity first tries alias resolution (case-insensitive), then exact
// name match. Only creates a new entity when neither lookup finds a match.
export async function upsertEntity(name, deps) {
	/* Case-insensitive alias resolution. */
	const normalized = name.toLowerCase();
	const aliasMatch = await deps.resolveAliasRow(deps.db, normalized);
	if (aliasMatch !== null) {
		return { entity: deps.rowToEntity(aliasMatch), created: false };
	}
	/* Exact name match. */
	const nameMatch = await deps.selectEntityByName(deps.db, name);
	if (nameMatch !== null) {
		return { entity: deps.rowToEntity(nameMatch), created: false };
	}
	/* Create new entity + alias. */
	const entityId = deps.generateId();
	const aliasId = deps.generateId();
	const txId = deps.generateId();
	const timestamp = deps.now();
	const entity = deps.buildEntityObject(entityId, name, timestamp);
	const afterSnapshot = deps.serialize(entity);
	await deps.insertEntityRow({
		db: deps.db,
		txId,
		entityId,
		name,
		aliasId,
		afterSnapshot,
		now: timestamp,
	});
	return { entity, created: true };
}
// CONTEXT: mergeEntities absorbs mergeId into keepId. Self-merge is rejected early.
// collectMergeData and executeMergeBatch are pre-composed deps to keep fan-out ≤ 7.
export async function mergeEntities(keepId, mergeId, deps) {
	if (keepId === mergeId) {
		deps.throwValidation("Cannot merge entity with itself");
	}
	const keepEntity = await deps.lookupEntity(keepId);
	const mergeEntity = await deps.lookupEntity(mergeId);
	const mergeData = await deps.collectMergeData(mergeId, mergeEntity.name);
	const txId = deps.generateId();
	const timestamp = deps.now();
	const snapshotInput = {
		keepId,
		keepName: keepEntity.name,
		mergeId,
		mergeName: mergeEntity.name,
		mergeCreatedAt: mergeEntity.created_at,
		subjTripleIds: mergeData.subjTripleIds,
		objTripleIds: mergeData.objTripleIds,
		mergeEntryIds: mergeData.mergeEntryIds,
		mergeAliasIds: mergeData.mergeAliasIds,
	};
	const snapshot = deps.buildMergeSnapshot(snapshotInput);
	const beforeSnapshot = deps.serialize(snapshot);
	await deps.executeMergeBatch({
		keepName: keepEntity.name,
		mergeName: mergeEntity.name,
		keepId,
		mergeId,
		txId,
		beforeSnapshot,
		now: timestamp,
	});
	const mergedCount = mergeData.subjTripleIds.length + mergeData.objTripleIds.length;
	return { merged_count: mergedCount };
}
export async function queryEntities(params, deps) {
	const limit = params.limit || 20;
	const decodedCursor = deps.decodeCursor(params.cursor);
	const { whereClause, binds } = deps.buildEntityQueryState(params, decodedCursor);
	const rows = await deps.queryCanonicalEntityRows(deps.db, whereClause, binds, limit + 1);
	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;
	const ids = [];
	for (let i = 0; i < pageRows.length; i++) {
		if (typeof pageRows[i].id === "string") {
			ids.push(pageRows[i].id);
		}
	}
	const aliasRows = await deps.queryAliasRowsByEntityIds(deps.db, ids);
	const items = deps.buildEntityQueryItems(pageRows, aliasRows);
	let nextCursor = null;
	if (hasMore && pageRows.length > 0) {
		nextCursor = deps.encodeCursor(pageRows[pageRows.length - 1].id);
	}
	return { items, next_cursor: nextCursor };
}
