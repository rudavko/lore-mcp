/** @implements FR-012, FR-013 — Verify update/delete tool handlers enforce policy checks before mutation. */
import { describe, expect, test } from "bun:test";
import { handleDelete } from "./tools-entry-admin.efct.js";
import { handleUpdate } from "./tools-entry-update.efct.js";
import { withEntryHandlerDeps } from "./tools-handler.test-helpers.js";
describe("mcp/tools.efct policy coverage", () => {
	test("handleUpdate enforces policy before mutation", async () => {
		const calls = [];
		await handleUpdate(
			{ id: "e-1", topic: "topic", content: "content" },
			withEntryHandlerDeps({
				checkPolicy: async (op, params) => {
					calls.push({ op, params });
				},
				updateAndEmbed: async () => ({ id: "e-1", _embedding_sync_failed: false }),
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		expect(calls.length).toBe(1);
		expect(calls[0]?.op).toBe("update");
	});
	test("handleDelete enforces policy before mutation", async () => {
		const calls = [];
		await handleDelete(
			{ id: "e-1", entity_type: "entry" },
			{
				checkPolicy: async (op, params) => {
					calls.push({ op, params });
				},
				deleteByType: async () => {},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			},
		);
		expect(calls.length).toBe(1);
		expect(calls[0]?.op).toBe("delete");
	});
});
