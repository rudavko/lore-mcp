/** @implements FR-002 — Graph-expansion data loading helpers. */
import {
	MAX_SQL_LIST_VALUES,
	splitIntoChunks,
	activeEntryWhereForIdChunk,
	activeEntryWhereForLowerTopicChunk,
} from "./runtime-graph-expand-shared.orch.4.js";

export async function selectActiveEntriesByIdsChunked(params) {
	if (params.ids.length === 0) {
		return [];
	}
	const rows = [];
	const seenIds = {};
	const chunks = splitIntoChunks(params.ids, MAX_SQL_LIST_VALUES);
	for (let i = 0; i < chunks.length; i++) {
		const chunkRows = await params.selectEntriesByIds(
			params.db,
			activeEntryWhereForIdChunk(chunks[i]),
			chunks[i],
		);
		for (let j = 0; j < chunkRows.length; j++) {
			const row = chunkRows[j];
			if (typeof row?.id !== "string" || seenIds[row.id] === true) {
				continue;
			}
			seenIds[row.id] = true;
			rows.push(row);
		}
	}
	return rows;
}

export async function loadUniqueGraphTriples(params, seedTopicsLower) {
	const triples = [];
	const seenTriples = {};
	const topicChunks = splitIntoChunks(seedTopicsLower, MAX_SQL_LIST_VALUES);
	for (let i = 0; i < topicChunks.length; i++) {
		const topicChunk = topicChunks[i];
		const placeholders = topicChunk.map(() => "?").join(",");
		const tripleWhere =
			"(lower(subject) IN (" +
			placeholders +
			") OR lower(object) IN (" +
			placeholders +
			")) AND deleted_at IS NULL";
		const chunkTriples = await params.graphNeighborRows(params.db, tripleWhere, [
			...topicChunk,
			...topicChunk,
		]);
		for (let j = 0; j < chunkTriples.length; j++) {
			const subject = typeof chunkTriples[j].subject === "string" ? chunkTriples[j].subject : "";
			const object = typeof chunkTriples[j].object === "string" ? chunkTriples[j].object : "";
			const key = subject + "\u0000" + object;
			if (seenTriples[key] === true) {
				continue;
			}
			seenTriples[key] = true;
			triples.push(chunkTriples[j]);
		}
	}
	return triples;
}

export async function loadRelatedTermRows(params, relatedTerms) {
	if (relatedTerms.length === 0) {
		return [];
	}
	const rows = [];
	const relatedTermChunks = splitIntoChunks(relatedTerms, MAX_SQL_LIST_VALUES);
	for (let i = 0; i < relatedTermChunks.length; i++) {
		const chunkRows = await params.selectEntriesByIds(
			params.db,
			activeEntryWhereForLowerTopicChunk(relatedTermChunks[i]),
			relatedTermChunks[i],
		);
		for (let j = 0; j < chunkRows.length; j++) {
			rows.push(chunkRows[j]);
		}
	}
	return rows;
}
