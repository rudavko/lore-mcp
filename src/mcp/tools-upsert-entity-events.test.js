/** @implements FR-009 — Verify upsert_entity emits resource change notifications on creation. */
import { describe, expect, test } from "bun:test";
import { handleUpsertEntity } from "./tools-entity.efct.js";
describe("mcp/tools.efct upsert_entity events", () => {
	test("notifies resource change exactly once when entity is created", async () => {
		let notifyCount = 0;
		await handleUpsertEntity(
			{ name: "Alpha" },
			{
				upsertEntity: async () => ({
					entity: { id: "e-1", name: "Alpha", created_at: "2026-01-01T00:00:00.000Z" },
					created: true,
				}),
				notifyResourceChange: (_entityType) => {
					notifyCount++;
				},
				formatResult: (_text, data) => data,
			},
		);
		expect(notifyCount).toBe(1);
	});
});
