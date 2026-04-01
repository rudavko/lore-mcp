/** @implements FR-002 — Regression: retrieve should survive auxiliary LIKE-branch failures. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure retrieve resilience", () => {
	test("retrieve still returns note hits when an auxiliary substring query throws pattern-too-complex", async () => {
		const handlers = new Map();
		const query = "engine_check object_create link_object retrieve";
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
				hybridSearch: async () => ({
					items: [
						{
							id: "note-1",
							topic: "retrieve regression",
							content: "exact note body",
							tags: ["qa"],
							score_lexical: 1,
							score_semantic: 0,
							score_graph: 0,
							score_total: 1,
							graph_hops: 0,
							created_at: "2026-03-21T00:00:00.000Z",
							updated_at: "2026-03-21T00:00:00.000Z",
						},
					],
					next_cursor: null,
					retrieval_ms: 1,
				}),
				queryEntities: async (args) => {
					if (args.name === query) {
						throw new Error("D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR");
					}
					return { items: [], next_cursor: null };
				},
				queryTriples: async () => ({ items: [], next_cursor: null }),
			},
		);
		const handler = handlers.get("retrieve");
		expect(handler).toBeDefined();
		const result = await handler({ query });
		expect(result.items).toHaveLength(1);
		expect(result.items[0].kind).toBe("note");
		expect(result.items[0].id).toBe("note-1");
	});
});
