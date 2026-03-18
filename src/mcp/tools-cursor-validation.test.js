/** @implements FR-008, FR-002, FR-004 — Verify cursor validation behavior across query, query_graph, and history handlers. */
import { describe, expect, test } from "bun:test";
import { handleQueryPlain } from "./tools-entry-query-plain.efct.js";
import { handleQueryGraph } from "./tools-graph-query.efct.js";
import { handleHistory } from "./tools-system.efct.js";
import {
	withCursorHandlerDeps,
	withEntryQueryHandlerDeps,
	withGraphQueryHandlerDeps,
} from "./tools-handler.test-helpers.js";
describe("mcp/tools.efct cursor validation", () => {
	test("rejects invalid cursor for query plain path", async () => {
		let called = false;
		let rejected = null;
		try {
			await handleQueryPlain(
				{ cursor: "INVALID_CURSOR_BASE64" },
				withEntryQueryHandlerDeps({
					queryEntries: async () => {
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
	test("rejects invalid cursor for graph query path", async () => {
		let called = false;
		let rejected = null;
		try {
			await handleQueryGraph(
				{ cursor: "INVALID_CURSOR_BASE64" },
				withGraphQueryHandlerDeps({
					queryTriples: async () => {
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
	test("rejects invalid cursor for history path", async () => {
		let called = false;
		let rejected = null;
		try {
			await handleHistory(
				{ cursor: "INVALID_CURSOR_BASE64" },
				withCursorHandlerDeps({
					getHistory: async () => {
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
