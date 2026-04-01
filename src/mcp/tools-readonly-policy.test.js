/** @implements FR-002, FR-019 — Regression: read-only MCP tools must not be gated by write-disable policy hooks. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure read-only policy isolation", () => {
	test("retrieve and engine_check do not invoke write-disable policy hooks", async () => {
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
				checkPolicy: async () => {
					throw new Error("MCP write action is temporarily disabled");
				},
				hybridSearch: async () => ({
					items: [
						{
							id: "note-1",
							topic: "read-only regression",
							content: "Retrieve should still work while writes are disabled.",
							tags: [],
							source: "test",
							confidence: 1,
							created_at: "2026-03-25T00:00:00Z",
							updated_at: "2026-03-25T00:00:00Z",
						},
					],
					next_cursor: null,
				}),
				queryEntities: async () => ({ items: [], next_cursor: null }),
				queryTriples: async () => ({ items: [], next_cursor: null }),
				querySummaryCounts: async () => [
					{
						results: [
							{ t: "entries", c: 1 },
							{ t: "triples", c: 0 },
							{ t: "entities", c: 0 },
						],
					},
				],
				getHistory: async () => ({
					items: [{ created_at: "2026-03-25T00:00:00Z" }],
					next_cursor: null,
				}),
				appVersion: "0.0.1",
				buildHash: "test-build",
				formatResult: (_text, data) => data,
				formatError: (error) => error,
			},
		);

		const retrieve = await handlers.retrieve({ query: "read-only", limit: 10 });
		expect(Array.isArray(retrieve.items)).toBe(true);
		expect(retrieve.items).toHaveLength(1);
		expect(retrieve.items[0].kind).toBe("note");

		const status = await handlers.engine_check({ action: "status" });
		expect(status.action).toBe("status");
		expect(status.build_hash).toBe("test-build");
		expect(status.entries).toBe(1);
	});
});
