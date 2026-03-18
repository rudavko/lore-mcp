/** @implements FR-008 — Shared pure helpers for history undo statement building. */
function asString(value) {
	return typeof value === "string" ? value : null;
}

function asStringArray(value) {
	if (typeof value !== "object" || value === null || !("length" in value)) {
		return [];
	}
	const list = value;
	if (typeof list.length !== "number") {
		return [];
	}
	const out = [];
	for (let i = 0; i < list.length; i++) {
		const item = list[i];
		if (typeof item === "string") {
			out.push(item);
		}
	}
	return out;
}

function makePlaceholders(count) {
	let placeholders = "";
	for (let i = 0; i < count; i++) {
		if (i > 0) {
			placeholders += ", ";
		}
		placeholders += "?";
	}
	return placeholders;
}

function buildIdScopedUpdate({ table, column, value, currentValue, ids }) {
	if (ids.length === 0) {
		return null;
	}
	const placeholders = makePlaceholders(ids.length);
	const sql =
		currentValue !== null
			? `UPDATE ${table} SET ${column} = ? WHERE ${column} = ? AND id IN (${placeholders})`
			: `UPDATE ${table} SET ${column} = ? WHERE id IN (${placeholders})`;
	return {
		sql,
		binds: currentValue !== null ? [value, currentValue, ...ids] : [value, ...ids],
	};
}

function buildDeleteMergeAliasSql(aliasCount) {
	if (aliasCount <= 0) {
		return `DELETE FROM entity_aliases WHERE alias = ? AND canonical_entity_id = ?`;
	}
	return `DELETE FROM entity_aliases WHERE alias = ? AND canonical_entity_id = ? AND id NOT IN (${makePlaceholders(aliasCount)})`;
}

function escapeJsonString(s) {
	let result = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '"') {
			result += '\\"';
		} else if (ch === "\\") {
			result += "\\\\";
		} else if (ch === "\n") {
			result += "\\n";
		} else if (ch === "\r") {
			result += "\\r";
		} else if (ch === "\t") {
			result += "\\t";
		} else {
			result += ch;
		}
	}
	return result;
}

function serializeTags(tags) {
	if (tags.length === 0) return "[]";
	let result = "[";
	for (let i = 0; i < tags.length; i++) {
		if (i > 0) result += ",";
		result += '"' + escapeJsonString(tags[i]) + '"';
	}
	result += "]";
	return result;
}

function buildRevertTransactionStatements({ entityType, entityId, revertId, txId, now }) {
	return [
		{
			sql: `INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
				 VALUES (?, 'REVERT', ?, ?, ?, ?, ?)`,
			binds: [revertId, entityType, entityId, null, null, now],
		},
		{
			sql: `UPDATE transactions SET reverted_by = ? WHERE id = ?`,
			binds: [revertId, txId],
		},
	];
}

export {
	asString,
	asStringArray,
	buildDeleteMergeAliasSql,
	buildIdScopedUpdate,
	buildRevertTransactionStatements,
	serializeTags,
};
