/** @implements FR-002 — Shared graph-expansion query and normalization helpers. */
export const MAX_SQL_LIST_VALUES = 40;
const ACTIVE_ENTRY_FILTER =
	"deleted_at IS NULL AND (expires_at IS NULL OR datetime(expires_at) > datetime('now') OR (knowledge_type = 'hypothesis' AND status = 'refuted'))";

export function splitIntoChunks(values, maxChunkSize) {
	const chunks = [];
	for (let i = 0; i < values.length; i += maxChunkSize) {
		chunks.push(values.slice(i, i + maxChunkSize));
	}
	return chunks;
}

export function activeEntryWhereForIdChunk(ids) {
	return "id IN (" + ids.map(() => "?").join(",") + ") AND " + ACTIVE_ENTRY_FILTER;
}

export function activeEntryWhereForLowerTopicChunk(terms) {
	return "lower(topic) IN (" + terms.map(() => "?").join(",") + ") AND " + ACTIVE_ENTRY_FILTER;
}

export function normalizeGraphTerm(value) {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed.toLowerCase();
}
