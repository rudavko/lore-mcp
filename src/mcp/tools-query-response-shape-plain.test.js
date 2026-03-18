/** @implements FR-002, FR-004 — Verify plain query response normalization. */
import { describe, expect, test } from "bun:test";
import { handleQueryPlain } from "./tools-entry-query-plain.efct.js";
import { withEntryQueryHandlerDeps } from "./tools-handler.test-helpers.js";

describe("mcp/tools plain query response normalization", () => {
	test("plain query includes normalized score and embedding fields", async () => {
		const result = await handleQueryPlain(
			{ tags: ["qa"] },
			withEntryQueryHandlerDeps({
				queryEntries: async () => ({
					items: [
						{
							id: "e-1",
							topic: "QA",
							content: "Entry",
							tags: ["qa"],
							valid_from: null,
							valid_to: null,
							valid_to_state: "unspecified",
						},
					],
					next_cursor: null,
				}),
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].embedding_status).toBe("pending");
		expect(items[0].score_lexical).toBe(0);
		expect(items[0].score_semantic).toBe(0);
		expect(items[0].score_graph).toBe(0);
		expect(items[0].score_total).toBe(0);
		expect(items[0].valid_to_state).toBeUndefined();
		expect(items[0].valid_from).toBeUndefined();
		expect(items[0].valid_to).toBeUndefined();
		expect(typeof result.retrieval_ms).toBe("number");
	});

	test("plain query clears next_cursor when result items are empty", async () => {
		const result = await handleQueryPlain(
			{ tags: ["qa"] },
			withEntryQueryHandlerDeps({
				queryEntries: async () => ({
					items: [],
					next_cursor: "cursor-should-drop",
				}),
				formatResult: (_text, data) => data,
			}),
		);
		expect(result.next_cursor).toBeNull();
		expect(Array.isArray(result.items)).toBe(true);
		expect(result.items.length).toBe(0);
		expect(typeof result.retrieval_ms).toBe("number");
	});

	test("plain query applies as_of temporal filtering", async () => {
		const result = await handleQueryPlain(
			{ as_of: "2026-01-15T00:00:00.000Z" },
			withEntryQueryHandlerDeps({
				queryEntries: async () => ({
					items: [
						{
							id: "in-window",
							topic: "A",
							content: "A",
							tags: ["qa"],
							valid_from: "2026-01-01T00:00:00.000Z",
							valid_to: "2026-02-01T00:00:00.000Z",
						},
						{
							id: "out-window",
							topic: "B",
							content: "B",
							tags: ["qa"],
							valid_from: "2026-03-01T00:00:00.000Z",
							valid_to: "2026-04-01T00:00:00.000Z",
						},
					],
					next_cursor: null,
				}),
				formatResult: (_text, data) => data,
			}),
		);
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("in-window");
	});
});
