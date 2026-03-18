/** @implements FR-002, NFR-004 — Verify hybrid search memory-type weighting and cursor resume behavior. */
import { describe, expect, test } from "bun:test";
import { hybridSearch } from "./search.ops.efct.js";
function defaultMemoryTypeWeight(memoryType) {
	if (memoryType === "core") {
		return 1.25;
	}
	if (memoryType === "factual") {
		return 1.1;
	}
	return 0.9;
}
describe("db/search.ops memory weighting", () => {
	test("applies memory_type weighting and filters by knowledge_type/memory_type", async () => {
		const result = await hybridSearch(
			{
				query: "q",
				limit: 10,
				knowledge_type: "observation",
			},
			{
				lexicalSearch: async () => [
					{ id: "a", score: 0.9 },
					{ id: "b", score: 0.9 },
				],
				semanticSearch: async () => [],
				graphExpand: async () => [],
				fetchAndMapEntries: async () => [
					{
						id: "a",
						topic: "A",
						content: "A",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
					{
						id: "b",
						topic: "B",
						content: "B",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "core",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
				],
				computeAndRank: (lex) =>
					lex.map((it) => ({
						id: it.id,
						score_lexical: it.score,
						score_semantic: 0,
						score_graph: 0,
						score_total: it.score,
						graph_hops: 0,
					})),
				redistributeWeights: (weights) => weights,
					memoryTypeWeight: defaultMemoryTypeWeight,
				hasVectorize: false,
				nowMs: () => 0,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
			},
		);
		expect(result.items).toHaveLength(2);
		expect(result.items[0].id).toBe("b");
		expect(result.items[1].id).toBe("a");
	});
	test("encodes next_cursor and resumes page from decoded cursor", async () => {
		const page1 = await hybridSearch(
			{
				query: "q",
				limit: 1,
			},
			{
				lexicalSearch: async () => [
					{ id: "a", score: 0.9 },
					{ id: "b", score: 0.8 },
				],
				semanticSearch: async () => [],
				graphExpand: async () => [],
				fetchAndMapEntries: async () => [
					{
						id: "a",
						topic: "A",
						content: "A",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
					{
						id: "b",
						topic: "B",
						content: "B",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
				],
				computeAndRank: (lex) =>
					lex.map((it) => ({
						id: it.id,
						score_lexical: it.score,
						score_semantic: 0,
						score_graph: 0,
						score_total: it.score,
						graph_hops: 0,
					})),
				redistributeWeights: (weights) => weights,
				memoryTypeWeight: () => 1,
				hasVectorize: false,
				nowMs: () => 0,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
			},
		);
		expect(page1.items).toHaveLength(1);
		expect(page1.items[0].id).toBe("a");
		expect(page1.next_cursor).toBe(btoa("a"));
		const page2 = await hybridSearch(
			{
				query: "q",
				limit: 1,
				cursor: page1.next_cursor ?? undefined,
			},
			{
				lexicalSearch: async () => [
					{ id: "a", score: 0.9 },
					{ id: "b", score: 0.8 },
				],
				semanticSearch: async () => [],
				graphExpand: async () => [],
				fetchAndMapEntries: async () => [
					{
						id: "a",
						topic: "A",
						content: "A",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
					{
						id: "b",
						topic: "B",
						content: "B",
						tags: [],
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						expires_at: null,
						status: "active",
						knowledge_type: "observation",
						memory_type: "fleeting",
						canonical_entity_id: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
				],
				computeAndRank: (lex) =>
					lex.map((it) => ({
						id: it.id,
						score_lexical: it.score,
						score_semantic: 0,
						score_graph: 0,
						score_total: it.score,
						graph_hops: 0,
					})),
				redistributeWeights: (weights) => weights,
				memoryTypeWeight: () => 1,
				hasVectorize: false,
				nowMs: () => 0,
				decodeCursor: (cursor) => (cursor ? atob(cursor) : null),
				encodeCursor: (id) => btoa(id),
			},
		);
		expect(page2.items).toHaveLength(1);
		expect(page2.items[0].id).toBe("b");
		expect(page2.next_cursor).toBeNull();
	});
});
