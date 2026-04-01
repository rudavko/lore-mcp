/** @implements FR-019 — RED regression for non-JSON engine_check status text output. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";

const std = createGlobalTestStd(globalThis);

describe("mcp/tools engine_check JSON text regression", () => {
	test("engine_check status text is parseable JSON without a human-readable prefix", async () => {
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
				appVersion: "0.2.0",
				buildHash: "build-123",
				querySummaryCounts: async () => [
					{
						results: [
							{ t: "entries", c: 1 },
							{ t: "triples", c: 2 },
							{ t: "entities", c: 3 },
						],
					},
				],
				getHistory: async () => ({
					items: [{ created_at: "2026-03-30T00:00:00.000Z" }],
					next_cursor: null,
				}),
				formatResult: (text, data) => ({
					text,
					data,
				}),
				formatError: (error) => error,
			},
		);

		const result = await handlers.engine_check({ action: "status" });

		expect(JSON.parse(result.text)).toEqual(result.data);
	});
});
