/** @implements FR-016, FR-002, NFR-001 — Verify hybrid retrieval acceptance behavior and provenance-sensitive ranking inputs. */
import { describe, expect, test } from "bun:test";
import { hybridSearch } from "./search.ops.efct.js";
const FIXTURES = [
	{
		id: "probe-lexical-b",
		topic: "probe-lexical-B",
		content:
			"Cloudflare D1 is a serverless SQLite database. It supports FTS5 virtual tables for full text search in workers. Workers can query D1 using SQL.",
		tags: ["qa"],
	},
	{
		id: "eiffel-entry",
		topic: "Eiffel Tower",
		content: "Paris landmark iron structure completed in the nineteenth century",
		tags: ["qa"],
	},
	{
		id: "qa-bug-report",
		topic: "QA bug report",
		content: "conflict detection crashes with software failures and errors",
		tags: ["qa"],
	},
	{
		id: "persistent-storage-entry",
		topic: "Persistent storage for agents",
		content: "persistent storage for conversational agents across sessions",
		tags: ["qa"],
	},
];
function tokenize(text) {
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}
function lexicalSearch(query, _limit) {
	const queryTokens = tokenize(query);
	const results = [];
	for (let i = 0; i < FIXTURES.length; i++) {
		const haystack = (FIXTURES[i].topic + " " + FIXTURES[i].content).toLowerCase();
		let matches = 0;
		for (let j = 0; j < queryTokens.length; j++) {
			if (haystack.indexOf(queryTokens[j]) >= 0) {
				matches += 1;
			}
		}
		if (matches > 0 && queryTokens.length > 0) {
			results.push({ id: FIXTURES[i].id, score: matches / queryTokens.length });
		}
	}
	return Promise.resolve(results);
}
function semanticSearchFactory(minScore) {
	return async (query, _limit) => {
		const q = query.toLowerCase();
		const matches = [];
		if (q.indexOf("iron structure built nineteenth century") >= 0) {
			matches.push({ id: "eiffel-entry", score: 0.62 });
		}
		if (q.indexOf("software problems failures") >= 0) {
			matches.push({ id: "qa-bug-report", score: 0.58 });
		}
		if (q.indexOf("persistent storage for conversational agents across sessions") >= 0) {
			matches.push({ id: "persistent-storage-entry", score: 0.55 });
		}
		const filtered = [];
		for (let i = 0; i < matches.length; i++) {
			if (matches[i].score >= minScore) {
				filtered.push(matches[i]);
			}
		}
		return filtered;
	};
}
function fetchAndMapEntries(ids) {
	const out = [];
	for (let i = 0; i < ids.length; i++) {
		for (let j = 0; j < FIXTURES.length; j++) {
			if (FIXTURES[j].id === ids[i]) {
				out.push(FIXTURES[j]);
				break;
			}
		}
	}
	return Promise.resolve(out);
}
function computeTotalScore(lexical, semantic, graph, weights) {
	return lexical * weights.lexical + semantic * weights.semantic + graph * weights.graph;
}
function redistributeWeights(weights, hasVectorize) {
	if (hasVectorize) {
		return { lexical: weights.lexical, semantic: weights.semantic, graph: weights.graph };
	}
	return {
		lexical: weights.lexical + weights.semantic * 0.6,
		semantic: 0,
		graph: weights.graph + weights.semantic * 0.4,
	};
}
function computeAndRank(lexResults, semResults, graphResults, weights) {
	const map = {};
	for (let i = 0; i < lexResults.length; i++) {
		map[lexResults[i].id] = {
			id: lexResults[i].id,
			score_lexical: lexResults[i].score,
			score_semantic: 0,
			score_graph: 0,
			graph_hops: 0,
		};
	}
	for (let i = 0; i < semResults.length; i++) {
		const existing = map[semResults[i].id];
		map[semResults[i].id] = {
			id: semResults[i].id,
			score_lexical: existing ? existing.score_lexical : 0,
			score_semantic: semResults[i].score,
			score_graph: existing ? existing.score_graph : 0,
			graph_hops: existing ? existing.graph_hops : 0,
		};
	}
	for (let i = 0; i < graphResults.length; i++) {
		const existing = map[graphResults[i].id];
		map[graphResults[i].id] = {
			id: graphResults[i].id,
			score_lexical: existing ? existing.score_lexical : 0,
			score_semantic: existing ? existing.score_semantic : 0,
			score_graph: graphResults[i].score,
			graph_hops: graphResults[i].hops,
		};
	}
	const ids = Object.keys(map);
	const out = [];
	for (let i = 0; i < ids.length; i++) {
		const item = map[ids[i]];
		out.push({
			id: item.id,
			score_lexical: item.score_lexical,
			score_semantic: item.score_semantic,
			score_graph: item.score_graph,
			score_total: computeTotalScore(
				item.score_lexical,
				item.score_semantic,
				item.score_graph,
				weights,
			),
			graph_hops: item.graph_hops,
		});
	}
	out.sort((a, b) => b.score_total - a.score_total);
	return out;
}
async function runAcceptanceQuery(query, minSemanticScore = 0.5) {
	const result = await hybridSearch(
		{ query, limit: 5 },
		{
			lexicalSearch,
			semanticSearch: semanticSearchFactory(minSemanticScore),
			graphExpand: async () => [],
			fetchAndMapEntries,
			computeAndRank,
			redistributeWeights,
			memoryTypeWeight: () => 1,
			hasVectorize: true,
			nowMs: () => 0,
			decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
			encodeCursor: (id) => btoa(id),
		},
	);
	if (result.items.length === 0) {
		return null;
	}
	return result.items[0].id;
}
describe("search acceptance matrix", () => {
	test("serverless SQLite full text search => probe-lexical-B", async () => {
		expect(await runAcceptanceQuery("serverless SQLite full text search")).toBe(
			"probe-lexical-b",
		);
	});
	test("Eiffel Tower Paris => Eiffel Tower entry", async () => {
		expect(await runAcceptanceQuery("Eiffel Tower Paris")).toBe("eiffel-entry");
	});
	test("iron structure built nineteenth century => Eiffel Tower entry", async () => {
		expect(await runAcceptanceQuery("iron structure built nineteenth century")).toBe(
			"eiffel-entry",
		);
	});
	test("software problems failures => QA bug report", async () => {
		expect(await runAcceptanceQuery("software problems failures")).toBe("qa-bug-report");
	});
	test("long natural language query does not crash", async () => {
		const topId = await runAcceptanceQuery(
			"persistent storage for conversational agents across sessions",
		);
		expect(topId).toBe("persistent-storage-entry");
	});
	test("C-4 regression: tokenized query 'Cloudflare workers SQL' hits probe-lexical-B", async () => {
		expect(await runAcceptanceQuery("Cloudflare workers SQL")).toBe("probe-lexical-b");
	});
	test("C-4 regression: tokenized query 'database full text' hits probe-lexical-B", async () => {
		expect(await runAcceptanceQuery("database full text")).toBe("probe-lexical-b");
	});
	test("C-5 regression: long tokenized queries return results without throwing", async () => {
		const q1 = await runAcceptanceQuery("serverless SQLite full text search workers");
		const q2 = await runAcceptanceQuery(
			"persistent storage for conversational agents across sessions",
		);
		const q3 = await runAcceptanceQuery(
			"conflict detection crashes NOT NULL constraint failed",
		);
		expect(q1).not.toBeNull();
		expect(q2).not.toBeNull();
		expect(q3).not.toBeNull();
	});
});
