/** @implements FR-003, NFR-001 — Triple orchestration over validation, conflict checks, and persistence. */
/** Sentinel for TDD hook. */
export const _MODULE = "triples.efct";
export async function createTriple(params, deps) {
	const normalizedValidity = deps.deriveValidToStateFromInput(params.valid_to ?? undefined);
	const validation = deps.validateTripleFields({
		subject: params.subject,
		predicate: params.predicate,
		object: params.object,
		valid_from: params.valid_from ?? undefined,
		valid_to: normalizedValidity.validTo ?? undefined,
	});
	if (!validation.ok) {
		deps.throwValidation(validation.error.message);
	}
	const id = deps.generateId();
	const txId = deps.generateId();
	const timestamp = deps.now();
	const triple = deps.buildTripleObject(
		id,
		{
			...params,
			valid_to: normalizedValidity.validTo ?? undefined,
			valid_to_state: params.valid_to_state ?? normalizedValidity.validToState,
		},
		timestamp,
	);
	const afterSnapshot = deps.serialize(triple);
	await deps.insertTripleRow({
		db: deps.db,
		txId,
		tripleId: id,
		subject: triple.subject,
		predicate: triple.predicate,
		object: triple.object,
		source: triple.source,
		actor: triple.actor,
		confidence: triple.confidence,
		validFrom: triple.valid_from,
		validTo: triple.valid_to,
		validToState: triple.valid_to_state,
		afterSnapshot,
		now: timestamp,
	});
	return triple;
}
export async function updateTriple(id, params, deps) {
	const normalizedValidity = deps.deriveValidToStateFromInput(params.valid_to ?? undefined);
	const validation = deps.validateTripleFields({
		predicate: params.predicate,
		object: params.object,
		valid_from: params.valid_from ?? undefined,
		valid_to: normalizedValidity.validTo ?? undefined,
	});
	if (!validation.ok) {
		deps.throwValidation(validation.error.message);
	}
	const existing = await deps.fetchExistingTriple(id);
	const txId = deps.generateId();
	const timestamp = deps.now();
	const merged = {
		id: existing.id,
		subject: existing.subject,
		predicate: params.predicate !== undefined ? params.predicate : existing.predicate,
		object: params.object !== undefined ? params.object : existing.object,
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
		status: existing.status,
		created_at: existing.created_at,
	};
	const beforeSnapshot = deps.serialize(existing);
	const afterSnapshot = deps.serialize(merged);
	await deps.updateTripleRow({
		db: deps.db,
		id,
		txId,
		predicate: merged.predicate,
		object: merged.object,
		source: merged.source,
		actor: merged.actor,
		confidence: merged.confidence,
		validFrom: merged.valid_from,
		validTo: merged.valid_to,
		validToState: merged.valid_to_state,
		beforeSnapshot,
		afterSnapshot,
		now: timestamp,
	});
	return merged;
}
export async function upsertTriple(params, deps) {
	const existing = await deps.findActiveTriples(params.subject, params.predicate);
	if (params.predicate_multi === true) {
		for (let i = 0; i < existing.length; i++) {
			if (existing[i].object === params.object) {
				return { triple: existing[i], created: false };
			}
		}
		const triple = await deps.createTriple(params);
		return { triple, created: true };
	}
	if (existing.length === 0) {
		const triple = await deps.createTriple(params);
		return { triple, created: true };
	}
	const triple = await deps.updateTriple(existing[0].id, {
		object: params.object,
		source: params.source,
		actor: params.actor,
		confidence: params.confidence,
		valid_from: params.valid_from,
		valid_to: params.valid_to,
	});
	return { triple, created: false };
}
export async function deleteTriple(id, deps) {
	const existing = await deps.fetchExistingTriple(id);
	const txId = deps.generateId();
	const timestamp = deps.now();
	const beforeSnapshot = deps.serialize(existing);
	await deps.softDeleteTripleRow({
		db: deps.db,
		id,
		txId,
		beforeSnapshot,
		now: timestamp,
	});
}
// CONTEXT: buildWhereClause is a pre-composed dep (in index.orch.0.js) that calls
// buildTripleQueryConditions and joins the conditions array. This keeps fan-out ≤ 7.
export async function queryTriples(params, deps) {
	const limit = params.limit || 50;
	const decodedCursor = deps.decodeCursor(params.cursor);
	const { whereClause, binds } = deps.buildWhereClause(params, decodedCursor);
	const rows = await deps.queryTripleRows(deps.db, whereClause, binds, limit + 1);
	const hasMore = rows.length > limit;
	const pageLen = hasMore ? limit : rows.length;
	const items = [];
	for (let i = 0; i < pageLen; i++) {
		items.push(deps.rowToTriple(rows[i]));
	}
	let nextCursor = null;
	if (hasMore && pageLen > 0) {
		nextCursor = deps.encodeCursor(rows[pageLen - 1].id);
	}
	return { items, next_cursor: nextCursor };
}
export async function findActiveTriples(subject, predicate, deps) {
	const rows = await deps.queryTripleRows(
		deps.db,
		"deleted_at IS NULL AND subject = ? AND predicate = ?",
		[subject, predicate],
		100,
	);
	const triples = [];
	for (let i = 0; i < rows.length; i++) {
		triples.push(deps.rowToTriple(rows[i]));
	}
	return triples;
}
