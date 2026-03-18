/** @implements FR-003, NFR-001 — Verify set_type validation and notification behavior for entry classification updates. */
import { describe, expect, test } from "bun:test";
import { handleSetType } from "./tools-entry-admin.efct.js";
describe("mcp/tools.efct set_type", () => {
	test("rejects set_type when no type fields are provided", async () => {
		await expect(
			handleSetType(
				{ id: "e-1" },
				{
					setEntryTypes: async () => ({ id: "e-1" }),
					notifyResourceChange: () => {},
					formatResult: (_text, data) => data,
				},
			),
		).rejects.toEqual({
			code: "validation",
			message: "No type fields to update",
			retryable: false,
		});
	});
	test("updates entry type fields and emits entry resource change", async () => {
		const notifications = [];
		const result = await handleSetType(
			{ id: "e-1", knowledge_type: "fact", memory_type: "core" },
			{
				setEntryTypes: async () => ({
					id: "e-1",
					knowledge_type: "hypothesis",
					memory_type: "core",
				}),
				notifyResourceChange: (entityType) => {
					notifications.push(entityType);
				},
				formatResult: (_text, data) => data,
			},
		);
		expect(notifications).toEqual(["entry"]);
		expect(result.id).toBe("e-1");
		expect(result.knowledge_type).toBe("hypothesis");
		expect(result.memory_type).toBe("core");
	});
});
