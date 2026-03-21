/** @implements FR-009 — Verify retrieve surfaces entity results through the v0 MCP registration. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure retrieve entity registration", () => {
	test("retrieve includes entity items from the injected queryEntities dependency", async () => {
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
				formatError: (error) => error,
				hybridSearch: async () => ({ items: [], next_cursor: null, retrieval_ms: 1 }),
				queryEntities: async () => ({
					items: [
						{
							id: "e-1",
							name: "Alpha",
							aliases: ["alpha"],
							alias_count: 1,
							tags: [],
							created_at: "2026-01-01T00:00:00.000Z",
							updated_at: "2026-01-01T00:00:00.000Z",
						},
					],
					next_cursor: null,
				}),
				queryTriples: async () => ({ items: [], next_cursor: null }),
			},
		);
		const handler = handlers.get("retrieve");
		expect(handler).toBeDefined();
		const result = await handler({ query: "alpha", limit: 10 });
		const items = result.items || [];
		expect(items.some((item) => item.kind === "entity" && item.id === "e-1")).toBe(true);
	});
});
