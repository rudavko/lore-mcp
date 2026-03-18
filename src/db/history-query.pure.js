/** @implements FR-008 — Pure history row mapping and query-condition helpers. */
function rowToTransaction(r) {
	return {
		id: r.id,
		op: r.op,
		entity_type: r.entity_type,
		entity_id: r.entity_id,
		before_snapshot: r.before_snapshot ?? null,
		after_snapshot: r.after_snapshot ?? null,
		reverted_by: r.reverted_by ?? null,
		created_at: r.created_at,
	};
}

function buildHistoryQueryConditions(params, decodedCursor) {
	const conditions = [];
	const binds = [];
	if (decodedCursor) {
		conditions.push("id < ?");
		binds.push(decodedCursor);
	}
	if (params.entity_type) {
		conditions.push("entity_type = ?");
		binds.push(params.entity_type);
	}
	return { conditions, binds };
}

export { buildHistoryQueryConditions, rowToTransaction };
