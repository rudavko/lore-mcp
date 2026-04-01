/** @implements FR-002 — Regression: retrieve must apply as_of filtering to notes using note validity fields. */
import { describe, expect, test } from "bun:test";

import { registerTools } from "./tools.orch.1.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure retrieve as_of note filtering", () => {
	test("filters out notes that are not yet active at the requested as_of timestamp", async () => {
		const handlers = new Map();
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
				hybridSearch: async () => ({
					items: [
						{
							id: "note-future",
							topic: "future note",
							content: "not active yet",
							tags: ["qa"],
							score_lexical: 1,
							score_semantic: 0,
							score_graph: 0,
							score_total: 1,
							graph_hops: 0,
							valid_from: "2026-03-01T00:00:00.000Z",
							valid_to: "2026-04-01T00:00:00.000Z",
							created_at: "2026-02-15T00:00:00.000Z",
							updated_at: "2026-02-15T00:00:00.000Z",
						},
					],
					next_cursor: null,
					retrieval_ms: 1,
				}),
				queryEntities: async () => ({ items: [], next_cursor: null }),
				queryTriples: async () => ({ items: [], next_cursor: null }),
			},
		);
		const handler = handlers.get("retrieve");
		expect(handler).toBeDefined();
		const result = await handler({
			query: "future note",
			as_of: "2026-01-15T00:00:00.000Z",
		});
		expect(result.items).toEqual([]);
		expect(result.next_cursor).toBeNull();
	});
});
