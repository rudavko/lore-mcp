/** @implements FR-002 — Regression: retrieve must reject unresolved composite cursors instead of restarting pagination. */
import { describe, expect, test } from "bun:test";

import { registerTools } from "./tools.orch.1.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure retrieve cursor handling", () => {
	test("rejects a valid composite cursor when the merged result set no longer contains it", async () => {
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
				queryEntities: async () => ({ items: [], next_cursor: null }),
				queryTriples: async () => ({ items: [], next_cursor: null }),
			},
		);
		const handler = handlers.get("retrieve");
		expect(handler).toBeDefined();
		let rejected = null;
		try {
			await handler({
				query: "retrieve regression",
				cursor: std.btoa("note:missing-note"),
			});
		} catch (error) {
			rejected = error;
		}
		expect(rejected).toEqual({
			code: "validation",
			message: "Cursor not found in current result set",
			retryable: false,
		});
	});
});
