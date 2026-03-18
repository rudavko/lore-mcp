/** @implements FR-009 — Verify query_entities registration wiring in pure tool registration logic. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
describe("mcp/tools.pure query_entities registration", () => {
	test("registers handler that calls injected queryEntities dependency", async () => {
		const handlers = new Map();
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
				queryEntities: async () => ({
					items: [{ id: "e-1", name: "Alpha", aliases: ["alpha"], alias_count: 1 }],
					next_cursor: null,
				}),
				efctQueryEntities: async (_args, deps) => {
					const result = await deps.queryEntities(_args);
					return deps.formatResult("ok", result);
				},
			},
		);
		const handler = handlers.get("query_entities");
		expect(handler).toBeDefined();
		const result = await handler({ limit: 10 });
		const items = result.items || [];
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("e-1");
	});
});
