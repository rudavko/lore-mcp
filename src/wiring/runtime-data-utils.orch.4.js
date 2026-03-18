/** @implements FR-001 — Runtime data normalization helpers for JSON, tags, conflicts, and counts. */
function normalizeEntryTtlParam(params, std) {
	const raw = params.ttl_seconds;
	if (raw === undefined || raw === null || typeof raw === "number") {
		return params;
	}
	if (typeof raw !== "string") {
		return params;
	}
	const trimmed = raw.trim();
	if (!/^\d+$/u.test(trimmed)) {
		return params;
	}
	const parsed = std.Number(trimmed);
	if (!std.Number.isInteger(parsed) || !std.Number.isSafeInteger(parsed) || parsed <= 0) {
		return params;
	}
	return { ...params, ttl_seconds: parsed };
}

function parseTags(raw, std) {
	if (typeof raw !== "string" || raw.length === 0) {
		return [];
	}
	const parsed = std.json.parse(raw);
	if (!parsed.ok || !std.Array.isArray(parsed.value)) {
		return [];
	}
	const tags = [];
	for (let i = 0; i < parsed.value.length; i++) {
		if (typeof parsed.value[i] === "string") {
			tags.push(parsed.value[i]);
		}
	}
	return tags;
}

function jsonStringifyOrNull(value, std) {
	const serialized = std.json.stringify(value);
	return serialized.ok ? serialized.value : "null";
}

function countRowsValue(row, std) {
	if (row === null) {
		return 0;
	}
	const n = row.c;
	if (typeof n === "number") {
		return n;
	}
	if (typeof n === "string") {
		const parsed = std.Number(n);
		if (std.Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return 0;
}

function normalizeStatus(raw) {
	return raw === "refuted" ? "refuted" : "active";
}

function parseConflictRow(row, toConflictInfo, std) {
	const raw = row.data;
	if (typeof raw !== "string") {
		return null;
	}
	const parsed = std.json.parse(raw);
	if (!parsed.ok) {
		return null;
	}
	const narrowed = toConflictInfo(parsed.value);
	return narrowed === null ? null : narrowed;
}

export {
	countRowsValue,
	jsonStringifyOrNull,
	normalizeEntryTtlParam,
	normalizeStatus,
	parseConflictRow,
	parseTags,
};
