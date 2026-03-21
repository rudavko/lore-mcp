/** @implements FR-001, FR-002, FR-003 — Verify the registered MCP tool surface remains complete. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
const std = createGlobalTestStd(globalThis);
const EXPECTED_TOOLS = [
	"link_object",
	"object_create",
	"retrieve",
	"engine_check",
];
describe("mcp/tools.pure surface", () => {
	test("registers every supported tool on the MCP server surface", () => {
		const names = [];
		registerTools(
			{
				tool: (name) => {
					names.push(name);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
			},
		);
		expect(names).toHaveLength(EXPECTED_TOOLS.length);
		for (let i = 0; i < EXPECTED_TOOLS.length; i++) {
			expect(names.includes(EXPECTED_TOOLS[i])).toBe(true);
		}
	});

	test("engine_check help returns machine-readable action metadata", async () => {
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
				formatError: (error) => error,
			},
		);
		const result = await handlers.engine_check({ action: "help" });
		expect(result.action).toBe("help");
		expect(result.tools).toEqual(["link_object", "object_create", "retrieve", "engine_check"]);
		expect(Array.isArray(result.actions)).toBe(true);
		expect(result.actions[0].name).toBe("help");
		expect(result.actions[2].name).toBe("history");
		expect(result.actions[2].optional).toContain("limit");
		expect(result.actions[3].required).toContain("task_id");
		expect(result.examples.retrieve.query).toContain("Alice");
		expect(result.deprecations.replaced_by.update).toContain("supersedes");
	});
});
