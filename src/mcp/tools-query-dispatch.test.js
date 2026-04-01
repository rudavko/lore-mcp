/** @implements FR-002 — Verify retrieve registration dispatches across notes, entities, and links. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools.pure retrieve dispatch", () => {
	test("retrieve calls the injected note, entity, and link query dependencies", async () => {
		const handlers = new Map();
		let hybridCalls = 0;
		let entityCalls = 0;
		let tripleCalls = 0;
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
				hybridSearch: async () => {
					hybridCalls += 1;
					return { items: [], next_cursor: null, retrieval_ms: 1 };
				},
				queryEntities: async () => {
					entityCalls += 1;
					return { items: [], next_cursor: null };
				},
				queryTriples: async () => {
					tripleCalls += 1;
					return { items: [], next_cursor: null };
				},
			},
		);
		const handler = handlers.get("retrieve");
		expect(handler).toBeDefined();
		await handler({ query: "needle" });
		expect(hybridCalls).toBe(1);
		expect(entityCalls).toBe(2);
		expect(tripleCalls).toBe(3);
	});
});
