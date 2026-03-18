/** @implements FR-002 — Verify query dispatch chooses hybrid vs plain retrieval paths correctly. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
describe("mcp/tools.pure query dispatch", () => {
	test("uses hybrid query path for content filter queries", async () => {
		const handlers = new Map();
		let hybridCalls = 0;
		let plainCalls = 0;
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				formatResult: (_text, data) => data,
				formatError: (e) => e,
				efctQueryHybrid: async () => {
					hybridCalls += 1;
					return {};
				},
				efctQueryPlain: async () => {
					plainCalls += 1;
					return {};
				},
			},
		);
		const handler = handlers.get("query");
		expect(handler).toBeDefined();
		await handler({ content: "needle" });
		expect(hybridCalls).toBe(1);
		expect(plainCalls).toBe(0);
	});
	test("uses plain query path for tags-only filtering", async () => {
		const handlers = new Map();
		let hybridCalls = 0;
		let plainCalls = 0;
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				formatResult: (_text, data) => data,
				formatError: (e) => e,
				efctQueryHybrid: async () => {
					hybridCalls += 1;
					return {};
				},
				efctQueryPlain: async () => {
					plainCalls += 1;
					return {};
				},
			},
		);
		const handler = handlers.get("query");
		expect(handler).toBeDefined();
		await handler({ tags: ["qa"] });
		expect(hybridCalls).toBe(0);
		expect(plainCalls).toBe(1);
	});
});
