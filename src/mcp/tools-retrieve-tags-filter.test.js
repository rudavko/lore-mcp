/** @implements FR-003 — RED regression for missing tag filtering on retrieve. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools retrieve tag filter regression", () => {
	test("retrieve filters results by tags when a tags parameter is provided", async () => {
		const handlers = {};
		registerTools(
			{
				tool: (name, _description, _schema, handler) => {
					handlers[name] = handler;
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				hybridSearch: async () => ({
					items: [
						{
							id: "note-keep",
							topic: "keep",
							content: "keep me",
							tags: ["audit", "keep"],
							score_lexical: 1,
							score_semantic: 0,
							score_graph: 0,
							score_total: 1,
							created_at: "2026-03-30T00:00:00.000Z",
							updated_at: "2026-03-30T00:00:00.000Z",
						},
						{
							id: "note-drop",
							topic: "drop",
							content: "drop me",
							tags: ["drop"],
							score_lexical: 0.9,
							score_semantic: 0,
							score_graph: 0,
							score_total: 0.9,
							created_at: "2026-03-30T00:00:00.000Z",
							updated_at: "2026-03-30T00:00:00.000Z",
						},
					],
					next_cursor: null,
				}),
				queryEntities: async () => ({ items: [], next_cursor: null }),
				queryTriples: async () => ({ items: [], next_cursor: null }),
			},
		);

		const result = await handlers.retrieve({
			query: "note",
			tags: ["audit"],
			limit: 10,
		});

		expect(result.items.map((item) => item.id)).toEqual(["note-keep"]);
	});
});
