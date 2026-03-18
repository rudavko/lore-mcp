/** @implements FR-009 — Verify query_entities effect handler behavior and cursor validation. */
import { describe, expect, test } from "bun:test";
import { handleQueryEntities } from "./tools-entity.efct.js";
import { withCursorHandlerDeps } from "./tools-handler.test-helpers.js";
describe("mcp/tools.efct query_entities", () => {
	test("rejects invalid cursor", async () => {
		let called = false;
		let rejected = null;
		try {
			await handleQueryEntities(
				{ cursor: "INVALID_CURSOR_BASE64" },
				withCursorHandlerDeps({
					queryEntities: async () => {
						called = true;
						return { items: [], next_cursor: null };
					},
					formatResult: (_text, data) => data,
				}),
			);
		} catch (error) {
			rejected = error;
		}
		expect(called).toBe(false);
		expect(rejected).toEqual({
			code: "validation",
			message: "Invalid cursor",
			retryable: false,
		});
	});
});
