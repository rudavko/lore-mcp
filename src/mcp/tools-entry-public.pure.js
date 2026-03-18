/** @implements FR-003, FR-004, NFR-004 — Shared public entry shaping helpers for MCP tool responses. */
import {
	asRecord,
	stripValidityFields,
	withOptionalValidToState,
} from "./tools-public-record.pure.js";

export function readEmbeddingStatus(entry) {
	if (entry.embedding_status === "failed" || entry._embedding_sync_failed === true) {
		return "failed";
	}
	if (entry.embedding_status === "pending" || entry.embedding_status === "indexing") {
		return "pending";
	}
	if (entry.embedding_status === "ready") {
		return "ready";
	}
	const semanticScore = typeof entry.score_semantic === "number" ? entry.score_semantic : 0;
	return semanticScore > 0 ? "ready" : "pending";
}

export function normalizeMutationEntry(entry, normalizeValidToState) {
	const embeddingStatus = readEmbeddingStatus(entry);
	const embeddingSyncFailed = embeddingStatus === "failed";
	const withoutValidity = stripValidityFields(entry, normalizeValidToState);
	const {
		_embedding_sync_failed: _internalEmbeddingSyncFailed,
		valid_to_state: _rawState,
		...publicEntry
	} = withoutValidity;
	return {
		payload: withOptionalValidToState(
			{
				...publicEntry,
				embedding_status: embeddingStatus,
			},
			normalizeValidToState(entry.valid_to_state, entry.valid_to ?? null),
		),
		embeddingSyncFailed,
	};
}

export function normalizeQueryEntry(value, normalizeValidToState) {
	const rec = asRecord(value);
	if (rec === null) {
		return value;
	}
	const withoutValidity = stripValidityFields(rec, normalizeValidToState);
	const {
		_embedding_sync_failed: _internalEmbeddingSyncFailed,
		valid_to_state: _rawState,
		...publicEntry
	} = withoutValidity;
	const normalized = {
		...publicEntry,
		embedding_status: readEmbeddingStatus(rec),
		score_lexical: typeof rec.score_lexical === "number" ? rec.score_lexical : 0,
		score_semantic: typeof rec.score_semantic === "number" ? rec.score_semantic : 0,
		score_graph: typeof rec.score_graph === "number" ? rec.score_graph : 0,
		score_total: typeof rec.score_total === "number" ? rec.score_total : 0,
		graph_hops: typeof rec.graph_hops === "number" ? rec.graph_hops : 0,
	};
	return withOptionalValidToState(
		normalized,
		normalizeValidToState(rec.valid_to_state, rec.valid_to ?? null),
	);
}
