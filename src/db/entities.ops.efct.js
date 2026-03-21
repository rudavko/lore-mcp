/** @implements FR-003, NFR-001 — Entity orchestration for upsert, merge, and query flows. */
/** Sentinel for TDD hook. */
export const _MODULE = "entities.efct";

function normalizeEntityInput(input) {
	if (typeof input === "string") {
		return { name: input };
	}
	return input;
}

function mergeEntityPatch(existing, params, timestamp) {
	return {
		...existing,
		name: existing.name,
		entity_type: params.entity_type !== undefined ? params.entity_type : existing.entity_type,
		source: params.source !== undefined ? params.source : existing.source,
		confidence: params.confidence !== undefined ? params.confidence : existing.confidence,
		valid_from: params.valid_from !== undefined ? params.valid_from : existing.valid_from,
		valid_to:
			params.valid_to !== undefined
				? params.valid_to
				: existing.valid_to,
		valid_to_state:
			params.valid_to_state !== undefined
				? params.valid_to_state
				: existing.valid_to_state,
		tags: params.tags !== undefined ? params.tags : existing.tags,
		produced_by:
			params.produced_by !== undefined ? params.produced_by : existing.produced_by,
		about: params.about !== undefined ? params.about : existing.about,
		affects: params.affects !== undefined ? params.affects : existing.affects,
		specificity:
			params.specificity !== undefined ? params.specificity : existing.specificity,
		updated_at: timestamp,
	};
}

function entityChanged(left, right) {
	const keys = [
		"entity_type",
		"source",
		"confidence",
		"valid_from",
		"valid_to",
		"valid_to_state",
		"produced_by",
		"about",
		"affects",
		"specificity",
	];
	for (let i = 0; i < keys.length; i++) {
		if (left[keys[i]] !== right[keys[i]]) {
			return true;
		}
	}
	if (left.tags.length !== right.tags.length) {
		return true;
	}
	for (let i = 0; i < left.tags.length; i++) {
		if (left.tags[i] !== right.tags[i]) {
			return true;
		}
	}
	return false;
}

// CONTEXT: upsertEntity first tries alias resolution (case-insensitive), then exact
// name match. Only creates a new entity when neither lookup finds a match.
export async function upsertEntity(input, deps) {
	const params = normalizeEntityInput(input);
	const name = typeof params.name === "string" ? params.name : "";
	/* Case-insensitive alias resolution. */
	const normalized = name.toLowerCase();
	const aliasMatch = await deps.resolveAliasRow(deps.db, normalized);
	if (aliasMatch !== null) {
		const existing = deps.rowToEntity(aliasMatch);
		const timestamp = deps.now();
		const merged = mergeEntityPatch(existing, params, timestamp);
		if (!entityChanged(existing, merged)) {
			return { entity: existing, created: false, updated: false };
		}
		const txId = deps.generateId();
		await deps.updateEntityRow({
			db: deps.db,
			id: existing.id,
			txId,
			name: existing.name,
			entityType: merged.entity_type,
			source: merged.source,
			confidence: merged.confidence,
			validFrom: merged.valid_from,
			validTo: merged.valid_to,
			validToState: merged.valid_to_state,
			tagsJson: deps.serialize(merged.tags),
			producedBy: merged.produced_by,
			about: merged.about,
			affects: merged.affects,
			specificity: merged.specificity,
			beforeSnapshot: deps.serialize(existing),
			afterSnapshot: deps.serialize(merged),
			now: timestamp,
		});
		return { entity: merged, created: false, updated: true };
	}
	/* Exact name match. */
	const nameMatch = await deps.selectEntityByName(deps.db, name);
	if (nameMatch !== null) {
		const existing = deps.rowToEntity(nameMatch);
		const timestamp = deps.now();
		const merged = mergeEntityPatch(existing, params, timestamp);
		if (!entityChanged(existing, merged)) {
			return { entity: existing, created: false, updated: false };
		}
		const txId = deps.generateId();
		await deps.updateEntityRow({
			db: deps.db,
			id: existing.id,
			txId,
			name: existing.name,
			entityType: merged.entity_type,
			source: merged.source,
			confidence: merged.confidence,
			validFrom: merged.valid_from,
			validTo: merged.valid_to,
			validToState: merged.valid_to_state,
			tagsJson: deps.serialize(merged.tags),
			producedBy: merged.produced_by,
			about: merged.about,
			affects: merged.affects,
			specificity: merged.specificity,
			beforeSnapshot: deps.serialize(existing),
			afterSnapshot: deps.serialize(merged),
			now: timestamp,
		});
		return { entity: merged, created: false, updated: true };
	}
	/* Create new entity + alias. */
	const entityId = deps.generateId();
	const aliasId = deps.generateId();
	const txId = deps.generateId();
	const timestamp = deps.now();
	const entity = deps.buildEntityObject(entityId, params, timestamp);
	const afterSnapshot = deps.serialize(entity);
	await deps.insertEntityRow({
		db: deps.db,
		txId,
		entityId,
		name,
		aliasId,
		entityType: entity.entity_type,
		source: entity.source,
		confidence: entity.confidence,
		validFrom: entity.valid_from,
		validTo: entity.valid_to,
		validToState: entity.valid_to_state,
		tagsJson: deps.serialize(entity.tags),
		producedBy: entity.produced_by,
		about: entity.about,
		affects: entity.affects,
		specificity: entity.specificity,
		afterSnapshot,
		now: timestamp,
	});
	return { entity, created: true, updated: false };
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
