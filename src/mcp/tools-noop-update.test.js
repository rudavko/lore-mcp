/** @implements FR-012, FR-014 — Verify no-op guards for entry and triple update tool handlers. */
import { describe, expect, test } from "bun:test";
import { handleUpdate } from "./tools-entry-update.efct.js";
import { handleUpdateTriple } from "./tools-graph-update.efct.js";
import {
	withEntryHandlerDeps,
	withGraphHandlerDeps,
} from "./tools-handler.test-helpers.js";
describe("mcp/tools.efct no-op update guard", () => {
	test("rejects entry update with no patch fields", async () => {
		let rejected = null;
		try {
			await handleUpdate(
				{ id: "e-1" },
				withEntryHandlerDeps({
					checkPolicy: async () => {},
					updateAndEmbed: async () => ({ id: "e-1" }),
					notifyResourceChange: () => {},
					logEvent: () => {},
					formatResult: (_text, data) => data,
				}),
			);
		} catch (error) {
			rejected = error;
		}
		expect(rejected).toEqual({
			code: "validation",
			message: "No fields to update",
			retryable: false,
		});
	});
	test("rejects triple update with no patch fields", async () => {
		let rejected = null;
		try {
			await handleUpdateTriple(
				{ id: "t-1" },
				withGraphHandlerDeps({
					checkPolicy: async () => {},
					updateTriple: async () => ({ id: "t-1" }),
					notifyResourceChange: () => {},
					formatResult: (_text, data) => data,
				}),
			);
		} catch (error) {
			rejected = error;
		}
		expect(rejected).toEqual({
			code: "validation",
			message: "No fields to update",
			retryable: false,
		});
	});
});
