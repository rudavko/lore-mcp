/** @implements FR-002 — Hybrid search and embedding runtime orchestration. */
import {
	decodeCursor,
	encodeCursor,
	runLikeTokenFallback,
} from "./runtime-value-helpers.orch.3.js";
import { expandGraphSignals, selectActiveEntriesByIdsChunked } from "./runtime-graph-expand.orch.3.js";

function makeGraphAndSearchOps(ctx) {
	const lexicalSearch = async (query, limit) => {
		const sanitized = ctx.sanitizeFts5Query(query);
		if (sanitized.length > 0) {
			const ftsMatchQuery = sanitized.replace(/"\s+"/g, '" OR "');
			try {
				const rows = await ctx.fts5SearchRows(ctx.db, ftsMatchQuery, limit * 2);
				if (rows.length > 0) {
					let max = 0.001;
					const scores = [];
					for (let i = 0; i < rows.length; i++) {
						const rank =
							typeof rows[i].rank === "number"
								? rows[i].rank
								: ctx.std.Number(rows[i].rank || 0);
						const score = -rank;
						scores.push(score);
						if (score > max) {
							max = score;
						}
					}
					const out = [];
					for (let i = 0; i < rows.length; i++) {
						out.push({ id: rows[i].id, score: scores[i] / max });
					}
					return out;
				}
			} catch {
				/* fallback below */
			}
		}
		try {
			return await runLikeTokenFallback({
				db: ctx.db,
				query,
				limit,
				likeSearchRows: ctx.likeSearchRows,
				std: ctx.std,
			});
		} catch {
			return [];
		}
	};
	const semanticSearch = async (query, limit) => {
		return await ctx.semanticSearchPort(query, limit);
	};
	const graphExpand = async (ids) => {
		return await expandGraphSignals({
			db: ctx.db,
			seedIds: ids,
			selectEntriesByIds: ctx.selectEntriesByIds,
			graphNeighborRows: ctx.graphNeighborRows,
			std: ctx.std,
		});
	};
	const fetchAndMapEntries = async (ids) => {
		const rows = await selectActiveEntriesByIdsChunked({
			db: ctx.db,
			ids,
			selectEntriesByIds: ctx.selectEntriesByIds,
		});
		const mapped = [];
		for (let i = 0; i < rows.length; i++) {
			mapped.push(ctx.mapEntryRow(rows[i]));
		}
		return mapped;
	};
	const computeAndRank = (lexResults, semResults, graphResults, weights) => {
		const map = {};
		const upsert = (id, patch) => {
			map[id] = {
				id,
				score_lexical: 0,
				score_semantic: 0,
				score_graph: 0,
				score_total: 0,
				graph_hops: 0,
				...(map[id] || {}),
				...patch,
			};
		};
		for (let i = 0; i < lexResults.length; i++) {
			upsert(lexResults[i].id, { score_lexical: lexResults[i].score });
		}
		for (let i = 0; i < semResults.length; i++) {
			upsert(semResults[i].id, { score_semantic: semResults[i].score });
		}
		for (let i = 0; i < graphResults.length; i++) {
			upsert(graphResults[i].id, {
				score_graph: graphResults[i].score,
				graph_hops: graphResults[i].hops,
			});
		}
		const ids = ctx.std.Object.keys(map);
		const out = [];
		for (let i = 0; i < ids.length; i++) {
			const item = map[ids[i]];
			out.push({
				...item,
				score_total: ctx.computeTotalScore(
					item.score_lexical,
					item.score_semantic,
					item.score_graph,
					weights,
				),
			});
		}
		out.sort((a, b) => {
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
		return out;
	};
	const hasVectorize = ctx.hasSemanticSearchCapability === true;
	const hybridSearch = async (params) => {
		return await ctx.hybridSearchOrch(params, {
			lexicalSearch,
			semanticSearch,
			graphExpand,
			fetchAndMapEntries,
			computeAndRank,
			redistributeWeights: ctx.redistributeWeights,
			hasVectorize,
			memoryTypeWeight: (memoryType) => {
				if (memoryType === "core") {
					return 1.15;
				}
				if (memoryType === "factual") {
					return 1.05;
				}
				return 1;
			},
			nowMs: () => ctx.std.Date.now(),
			decodeCursor: (raw) => decodeCursor(raw, ctx.std),
			encodeCursor: (value) => encodeCursor(value, ctx.std),
		});
	};
	const syncEmbedding = async (id, text) => {
		await ctx.syncEmbeddingPort(id, text);
	};
	return { hybridSearch, syncEmbedding };
}

export { makeGraphAndSearchOps };
