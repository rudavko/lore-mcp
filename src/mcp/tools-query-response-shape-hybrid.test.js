/** @implements FR-002, FR-004 — Verify hybrid query response normalization. */
import { describe, expect, test } from "bun:test";
import { handleQueryHybrid } from "./tools-entry-query-hybrid.efct.js";
import { withEntryQueryHandlerDeps } from "./tools-handler.test-helpers.js";

describe("mcp/tools hybrid query response normalization", () => {
	test("hybrid query includes embedding_status and strips validity fields", async () => {
		const result = await handleQueryHybrid(
			{},
			withEntryQueryHandlerDeps({
				queryText: "qa",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-2",
							topic: "QA",
							content: "Entry",
							tags: ["qa"],
							score_lexical: 0.1,
							score_semantic: 0.2,
							score_graph: 0.3,
							score_total: 0.4,
							valid_from: null,
							valid_to: null,
							valid_to_state: "unspecified",
						},
					],
					next_cursor: null,
					retrieval_ms: 12,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].embedding_status).toBe("ready");
		expect(items[0].valid_to_state).toBeUndefined();
		expect(items[0].valid_from).toBeUndefined();
		expect(items[0].valid_to).toBeUndefined();
		expect(items[0].score_total).toBe(0.4);
		expect(result.retrieval_ms).toBe(12);
	});

	test("query keeps valid_to_state when it is bounded", async () => {
		const result = await handleQueryHybrid(
			{},
			withEntryQueryHandlerDeps({
				queryText: "qa",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-2",
							topic: "QA",
							content: "Entry",
							tags: ["qa"],
							score_lexical: 0.1,
							score_semantic: 0.2,
							score_graph: 0.3,
							score_total: 0.4,
							valid_to_state: "bounded",
						},
					],
					next_cursor: null,
					retrieval_ms: 12,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].valid_to_state).toBe("bounded");
	});

	test("query includes valid_from/valid_to when bounded values are present", async () => {
		const result = await handleQueryHybrid(
			{},
			withEntryQueryHandlerDeps({
				queryText: "qa",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-2",
							topic: "QA",
							content: "Entry",
							tags: ["qa"],
							score_lexical: 0.1,
							score_semantic: 0.2,
							score_graph: 0.3,
							score_total: 0.4,
							valid_from: "2026-01-01T00:00:00.000Z",
							valid_to: "2026-02-01T00:00:00.000Z",
							valid_to_state: "bounded",
						},
					],
					next_cursor: null,
					retrieval_ms: 12,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].valid_from).toBe("2026-01-01T00:00:00.000Z");
		expect(items[0].valid_to).toBe("2026-02-01T00:00:00.000Z");
		expect(items[0].valid_to_state).toBe("bounded");
	});

	test("hybrid query returns pending embedding_status when semantic score is zero", async () => {
		const result = await handleQueryHybrid(
			{},
			withEntryQueryHandlerDeps({
				queryText: "qa",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-3",
							topic: "QA",
							content: "Entry",
							tags: ["qa"],
							score_lexical: 0.9,
							score_semantic: 0,
							score_graph: 0,
							score_total: 0.36,
						},
					],
					next_cursor: null,
					retrieval_ms: 12,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].embedding_status).toBe("pending");
	});

	test("hybrid query enforces strict substring filters for topic/content when strict_substring=true", async () => {
		const result = await handleQueryHybrid(
			{ topic: "needle", content: "needle", strict_substring: true },
			withEntryQueryHandlerDeps({
				queryText: "needle",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-keep",
							topic: "contains needle topic",
							content: "contains needle content",
							tags: ["qa"],
							score_lexical: 0.7,
							score_semantic: 0.2,
							score_graph: 0.1,
							score_total: 1.0,
						},
						{
							id: "e-drop",
							topic: "unrelated",
							content: "still unrelated",
							tags: ["qa"],
							score_lexical: 0.1,
							score_semantic: 0.8,
							score_graph: 0.1,
							score_total: 1.0,
						},
					],
					next_cursor: null,
					retrieval_ms: 5,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("e-keep");
		expect(items[0].score_total).toBe(1.0);
	});

	test("hybrid query keeps semantically ranked non-substring items by default", async () => {
		const result = await handleQueryHybrid(
			{ topic: "needle", content: "needle" },
			withEntryQueryHandlerDeps({
				queryText: "needle",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-keep",
							topic: "contains needle topic",
							content: "contains needle content",
							tags: ["qa"],
							score_lexical: 0.7,
							score_semantic: 0.2,
							score_graph: 0.1,
							score_total: 1.0,
						},
						{
							id: "e-semantic",
							topic: "unrelated words",
							content: "different wording",
							tags: ["qa"],
							score_lexical: 0.05,
							score_semantic: 0.8,
							score_graph: 0.15,
							score_total: 1.0,
						},
					],
					next_cursor: null,
					retrieval_ms: 5,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(2);
		expect(items[0].id).toBe("e-keep");
		expect(items[1].id).toBe("e-semantic");
	});

	test("hybrid query clears next_cursor when strict filtering yields empty page", async () => {
		const result = await handleQueryHybrid(
			{ content: "needle phrase", strict_substring: true },
			withEntryQueryHandlerDeps({
				queryText: "needle phrase",
				hybridSearch: async () => ({
					items: [
						{
							id: "e-1",
							topic: "topic one",
							content: "content one",
							tags: ["qa"],
							score_lexical: 0.8,
							score_semantic: 0.2,
							score_graph: 0,
							score_total: 0.4,
						},
					],
					next_cursor: "cursor-should-drop",
					retrieval_ms: 8,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(0);
		expect(result.next_cursor).toBeNull();
	});

	test("hybrid query applies as_of temporal filtering", async () => {
		const result = await handleQueryHybrid(
			{ as_of: "2026-01-15T00:00:00.000Z" },
			withEntryQueryHandlerDeps({
				queryText: "bitemporal",
				hybridSearch: async () => ({
					items: [
						{
							id: "in-window",
							topic: "A",
							content: "A",
							tags: ["qa"],
							valid_from: "2026-01-01T00:00:00.000Z",
							valid_to: "2026-02-01T00:00:00.000Z",
							score_total: 1,
						},
						{
							id: "out-window",
							topic: "B",
							content: "B",
							tags: ["qa"],
							valid_from: "2026-03-01T00:00:00.000Z",
							valid_to: "2026-04-01T00:00:00.000Z",
							score_total: 0.9,
						},
					],
					next_cursor: null,
					retrieval_ms: 10,
				}),
				filterByTags: (items) => items,
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("in-window");
	});
});
