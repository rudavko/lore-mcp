/** @implements FR-002 — Graph-neighbor expansion helpers for hybrid retrieval. */
import {
	selectActiveEntriesByIdsChunked,
	loadUniqueGraphTriples,
	loadRelatedTermRows,
} from "./runtime-graph-expand-query.orch.4.js";
import {
	collectUniqueSeedIds,
	indexSeedTopics,
	accumulateGraphConnections,
	buildSeedSignalMap,
	applyRelatedTermSignals,
	collectGraphSignals,
} from "./runtime-graph-expand-state.orch.4.js";

async function expandGraphSignals(params) {
	if (params.seedIds.length === 0) {
		return [];
	}
	const seedState = collectUniqueSeedIds(params.seedIds);
	if (seedState.uniqueSeedIds.length === 0) {
		return [];
	}
	const seedRows = await selectActiveEntriesByIdsChunked({
		db: params.db,
		ids: seedState.uniqueSeedIds,
		selectEntriesByIds: params.selectEntriesByIds,
	});
	const seedTopicIndex = indexSeedTopics(seedRows);
	if (seedTopicIndex.seedTopicsLower.length === 0) {
		return [];
	}
	const triples = await loadUniqueGraphTriples(params, seedTopicIndex.seedTopicsLower);
	const connections = accumulateGraphConnections(triples, seedTopicIndex.seedTopicToIds);
	const outMap = buildSeedSignalMap(connections.seedConnections, params.std);
	const relatedTerms = params.std.Object.keys(connections.relatedTermConnections);
	const relatedRows = await loadRelatedTermRows(params, relatedTerms);
	applyRelatedTermSignals({
		relatedRows,
		relatedTermConnections: connections.relatedTermConnections,
		seenSeed: seedState.seenSeed,
		outMap,
		std: params.std,
	});
	return collectGraphSignals(outMap, params.std);
}

export { expandGraphSignals, selectActiveEntriesByIdsChunked };
