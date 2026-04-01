/** @implements FR-001, FR-003 — Entry orchestration over validated input and D1 effects. */
export async function createEntry(params, deps) {
	const normalizedValidity = deps.deriveValidToStateFromInput(params.valid_to ?? undefined);
	deps.validateCreateEntryInput(params, deps, normalizedValidity);
	const id = deps.generateId();
	const txId = deps.generateId();
	const timestamp = deps.now();
	const expiresAt =
		params.ttl_seconds !== undefined
			? deps.computeExpiresAt(timestamp, params.ttl_seconds)
			: null;
	let canonicalEntityId = params.canonical_entity_id ?? null;
	const resolvedAutoLink = await deps.resolveCreateAutoLinkState(params, deps, canonicalEntityId);
	canonicalEntityId = resolvedAutoLink.canonicalEntityId;
	const entry = deps.buildEntryObject(
		id,
		{
			...params,
			valid_to: normalizedValidity.validTo ?? undefined,
			valid_to_state: params.valid_to_state ?? normalizedValidity.validToState,
			expires_at: expiresAt,
			canonical_entity_id: canonicalEntityId,
		},
		timestamp,
	);
	const tagsJson = deps.serialize(entry.tags);
	const snapshots = deps.buildCreateSnapshots(
		entry,
		resolvedAutoLink.autoLinkState,
		canonicalEntityId,
		deps,
	);
	await deps.insertEntryRow({
		db: deps.db,
		txId,
		entryId: id,
		topic: entry.topic,
		content: entry.content,
		tagsJson,
		source: entry.source,
		actor: entry.actor,
		confidence: entry.confidence,
		validFrom: entry.valid_from,
		validTo: entry.valid_to,
		validToState: entry.valid_to_state,
		expiresAt: entry.expires_at ?? null,
		knowledgeType: entry.knowledge_type,
		memoryType: entry.memory_type,
		status: entry.status,
		canonicalEntityId: entry.canonical_entity_id,
		afterSnapshot: snapshots.afterSnapshot,
		now: timestamp,
		autoLinkPlan: snapshots.autoLinkPlan,
	});
	return entry;
}
// CONTEXT: fetchExistingEntry is a pre-composed dep (in index.orch.0.js) that calls
// selectEntryRow + rowToEntry + parseTags + throwNotFound. This keeps fan-out ≤ 7.
export async function updateEntry(id, params, deps) {
	const normalizedValidity = deps.deriveValidToStateFromInput(params.valid_to ?? undefined);
	const validation = deps.validateEntryFields({
		topic: params.topic,
		content: params.content,
		source: params.source ?? undefined,
		confidence: params.confidence ?? undefined,
		ttl_seconds: params.ttl_seconds ?? undefined,
		valid_from: params.valid_from ?? undefined,
		valid_to: normalizedValidity.validTo ?? undefined,
		knowledge_type: params.knowledge_type,
		memory_type: params.memory_type,
		status: params.status,
	});
	if (!validation.ok) {
		deps.throwValidation(validation.error.message);
	}
	const existing = await deps.fetchExistingEntry(id);
	const txId = deps.generateId();
	const timestamp = deps.now();
	const expiresAt =
		params.ttl_seconds !== undefined
			? deps.computeExpiresAt(timestamp, params.ttl_seconds)
			: (existing.expires_at ?? null);
	let canonicalEntityId =
		params.canonical_entity_id !== undefined
			? params.canonical_entity_id
			: existing.canonical_entity_id;
	const resolvedCanonicalEntityId = await deps.resolveTopicCanonicalEntityId(params.topic, deps);
	if (resolvedCanonicalEntityId !== null) {
		canonicalEntityId = resolvedCanonicalEntityId;
	}
	const merged = {
		id: existing.id,
		topic: params.topic !== undefined ? params.topic : existing.topic,
		content: params.content !== undefined ? params.content : existing.content,
		tags: params.tags !== undefined ? params.tags : existing.tags,
		source: params.source !== undefined ? params.source : existing.source,
		actor: params.actor !== undefined ? params.actor : existing.actor,
		confidence: params.confidence !== undefined ? params.confidence : existing.confidence,
		valid_from: params.valid_from !== undefined ? params.valid_from : existing.valid_from,
		valid_to:
			params.valid_to !== undefined
				? (normalizedValidity.validTo ?? null)
				: existing.valid_to,
		valid_to_state:
			params.valid_to !== undefined
				? normalizedValidity.validToState
				: existing.valid_to_state,
		expires_at: expiresAt,
		status: params.status !== undefined ? params.status : existing.status,
		knowledge_type:
			params.knowledge_type !== undefined ? params.knowledge_type : existing.knowledge_type,
		memory_type: params.memory_type !== undefined ? params.memory_type : existing.memory_type,
		canonical_entity_id: canonicalEntityId,
		created_at: existing.created_at,
		updated_at: timestamp,
	};
	await deps.persistUpdate(existing, merged, txId, timestamp);
	return merged;
}
export async function deleteEntry(id, deps) {
	const existing = await deps.fetchExistingEntry(id);
	const txId = deps.generateId();
	const timestamp = deps.now();
	const beforeSnapshot = deps.serialize(existing);
	await deps.softDeleteEntryRow({
		db: deps.db,
		id,
		txId,
		beforeSnapshot,
		now: timestamp,
	});
}
// CONTEXT: buildWhereClause is a pre-composed dep that calls buildQueryConditions
// and joins the conditions array. filterByTags is pre-composed to keep fan-out ≤ 7.
export async function queryEntries(params, deps) {
	const limit = params.limit || 50;
	let scanCursor = deps.decodeCursor(params.cursor);
	let exhausted = false;
	const matches = [];
	const scanLimit = limit + 1;
	while (!exhausted && matches.length < limit + 1) {
		const { whereClause, binds } = deps.buildWhereClause(params, scanCursor);
		const rows = await deps.queryEntryRows(deps.db, whereClause, binds, scanLimit);
		if (rows.length === 0) {
			exhausted = true;
			break;
		}
		const mapped = deps.mapRows(rows);
		const filtered = deps.filterByTags(mapped, params.tags);
		for (let i = 0; i < filtered.length; i++) {
			matches.push(filtered[i]);
			if (matches.length >= limit + 1) {
				break;
			}
		}
		scanCursor = rows[rows.length - 1].id;
		if (rows.length < scanLimit) {
			exhausted = true;
		}
	}
	const items = [];
	const count = matches.length > limit ? limit : matches.length;
	for (let i = 0; i < count; i++) {
		items.push(matches[i]);
	}
	let nextCursor = null;
	if (matches.length > limit && items.length > 0) {
		nextCursor = deps.encodeCursor(items[items.length - 1].id);
	}
	return { items, next_cursor: nextCursor };
}
