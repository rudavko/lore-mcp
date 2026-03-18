/** @implements FR-002, NFR-004 — Search orchestration for hybrid retrieval and embedding sync. */
/** Sentinel for TDD hook. */
export const _MODULE = "search.efct";
function collectSeedIds(lexResults, semResults) {
	const seedIds = [];
	for (let i = 0; i < lexResults.length; i++) {
		seedIds.push(lexResults[i].id);
	}
	for (let i = 0; i < semResults.length; i++) {
		let found = false;
		for (let j = 0; j < seedIds.length; j++) {
			if (seedIds[j] === semResults[i].id) {
				found = true;
				break;
			}
		}
		if (!found) {
			seedIds.push(semResults[i].id);
		}
	}
	return seedIds;
}
function mergeScoredEntries(scored, entries, params, deps) {
	const entryById = {};
	for (let i = 0; i < entries.length; i++) {
		entryById[entries[i].id] = entries[i];
	}
	const merged = [];
	for (let i = 0; i < scored.length; i++) {
		const entry = entryById[scored[i].id];
		if (!entry) {
			continue;
		}
		if (params.knowledge_type !== undefined && entry.knowledge_type !== params.knowledge_type) {
			continue;
		}
		if (params.memory_type !== undefined && entry.memory_type !== params.memory_type) {
			continue;
		}
		merged.push({
			...entry,
			...scored[i],
			score_total: scored[i].score_total * deps.memoryTypeWeight(entry.memory_type),
		});
	}
	merged.sort((a, b) => {
		if (b.score_total !== a.score_total) {
			return b.score_total - a.score_total;
		}
		if (a.id < b.id) {
			return -1;
		}
		if (a.id > b.id) {
			return 1;
		}
		return 0;
	});
	return merged;
}
function pageMergedEntries(merged, limit, rawCursor, deps) {
	const decodedCursor = deps.decodeCursor(rawCursor);
	let startIndex = 0;
	if (decodedCursor !== null) {
		let cursorIndex = -1;
		for (let i = 0; i < merged.length; i++) {
			if (merged[i].id === decodedCursor) {
				cursorIndex = i;
				break;
			}
		}
		if (cursorIndex >= 0) {
			startIndex = cursorIndex + 1;
		}
	}
	const endExclusive = startIndex + limit + 1;
	const pageSlice = merged.slice(startIndex, endExclusive);
	const hasMore = pageSlice.length > limit;
	const page = hasMore ? pageSlice.slice(0, limit) : pageSlice;
	const nextCursor =
		hasMore && page.length > 0 ? deps.encodeCursor(page[page.length - 1].id) : null;
	return { items: page, next_cursor: nextCursor };
}
async function loadHybridSignals(params, limit, deps) {
	const rawWeights = {
		lexical: params.weights?.lexical ?? 0.4,
		semantic: params.weights?.semantic ?? 0.4,
		graph: params.weights?.graph ?? 0.2,
	};
	const weights = deps.redistributeWeights(rawWeights, deps.hasVectorize);
	const lexResults = await deps.lexicalSearch(params.query, limit * 2);
	const semResults = deps.hasVectorize ? await deps.semanticSearch(params.query, limit * 2) : [];
	const seedIds = collectSeedIds(lexResults, semResults);
	const graphResults = seedIds.length > 0 ? await deps.graphExpand(seedIds) : [];
	return deps.computeAndRank(lexResults, semResults, graphResults, weights);
}
// CONTEXT: hybridSearch composes three retrieval signals (lexical, semantic, graph)
// into a ranked result list. Pre-composed deps lexicalSearch, semanticSearch, graphExpand
// keep callee fan-out ≤ 7. computeAndRank is pre-composed to handle scoring + sorting.
export async function hybridSearch(params, deps) {
	const startMs = deps.nowMs();
	const limit = params.limit || 20;
	const scored = await loadHybridSignals(params, limit, deps);
	if (scored.length === 0) {
		return { items: [], next_cursor: null, retrieval_ms: deps.nowMs() - startMs };
	}
	const scoredIds = [];
	for (let i = 0; i < scored.length; i++) {
		scoredIds.push(scored[i].id);
	}
	const entries = await deps.fetchAndMapEntries(scoredIds);
	const merged = mergeScoredEntries(scored, entries, params, deps);
	const page = pageMergedEntries(merged, limit, params.cursor, deps);
	return { items: page.items, next_cursor: page.next_cursor, retrieval_ms: deps.nowMs() - startMs };
}
export async function syncEmbedding(id, text, deps) {
	if (deps.aiRun === null || deps.vectorizeUpsert === null) {
		return;
	}
	const result = await deps.aiRun("@cf/baai/bge-base-en-v1.5", { text: [text] });
	if (result.data && result.data.length > 0) {
		await deps.vectorizeUpsert([{ id, values: result.data[0] }]);
	}
}
