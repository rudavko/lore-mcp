/** @implements FR-002 — Host adapter builders for semantic search and embedding sync. */
import { parseSemanticMinScore } from "./runtime-value-helpers.orch.3.js";

function hasSemanticSearchCapability({ aiRun, vectorQuery }) {
	return !!(aiRun && vectorQuery);
}

function createSemanticSearchPort({ aiRun, vectorQuery, semanticMinScore, std }) {
	return async (query, limit) => {
		if (!hasSemanticSearchCapability({ aiRun, vectorQuery })) {
			return [];
		}
		const minScore = parseSemanticMinScore(semanticMinScore, std);
		try {
			const embeddingResult = await aiRun("@cf/baai/bge-base-en-v1.5", { text: [query] });
			const vector =
				embeddingResult.data && embeddingResult.data.length > 0 ? embeddingResult.data[0] : null;
			if (vector === null) {
				return [];
			}
			const matches = await vectorQuery(vector, { topK: limit });
			if (!matches.matches) {
				return [];
			}
			const out = [];
			for (let i = 0; i < matches.matches.length; i++) {
				if (matches.matches[i].score >= minScore) {
					out.push({ id: matches.matches[i].id, score: matches.matches[i].score });
				}
			}
			return out;
		} catch {
			return [];
		}
	};
}

function createSyncEmbeddingPort({ aiRun, vectorizeUpsert, syncEmbeddingOrch }) {
	return async (id, text) => {
		await syncEmbeddingOrch(id, text, { aiRun, vectorizeUpsert });
	};
}

export { createSemanticSearchPort, createSyncEmbeddingPort, hasSemanticSearchCapability };
