/** @implements FR-001, FR-003, FR-014 — Verify validity interval validation for entry/triple mutation handlers. */
import { describe, expect, test } from "bun:test";
import {
	handleStore,
} from "./tools-entry-store.efct.js";
import { handleUpdate } from "./tools-entry-update.efct.js";
import {
	handleRelateConflict,
	handleRelateCreate,
} from "./tools-graph-relate.efct.js";
import { handleUpdateTriple } from "./tools-graph-update.efct.js";
import {
	withEntryHandlerDeps,
	withGraphHandlerDeps,
} from "./tools-handler.test-helpers.js";

describe("mcp/tools.efct validity interval validation", () => {
	test("store rejects invalid valid_from", async () => {
		await expect(
			handleStore(
				{ topic: "topic", content: "content", valid_from: "not-a-date" },
				withEntryHandlerDeps({
					checkPolicy: async () => {},
					createAndEmbed: async () => ({ id: "e-1" }),
					notifyResourceChange: () => {},
					logEvent: () => {},
					formatResult: (_text, data) => data,
				}),
			),
		).rejects.toEqual({
			code: "validation",
			message: "Invalid valid_from (must be ISO-8601)",
			retryable: false,
		});
	});
	test("update rejects invalid valid_to", async () => {
		await expect(
			handleUpdate(
				{ id: "e-1", valid_to: "bad-date" },
				withEntryHandlerDeps({
					checkPolicy: async () => {},
					updateAndEmbed: async () => ({ id: "e-1" }),
					notifyResourceChange: () => {},
					logEvent: () => {},
					formatResult: (_text, data) => data,
				}),
			),
		).rejects.toEqual({
			code: "validation",
			message: "Invalid valid_to (must be ISO-8601)",
			retryable: false,
		});
	});
	test("store rejects valid_to earlier than valid_from", async () => {
		await expect(
			handleStore(
				{
						topic: "topic",
						content: "content",
						valid_from: "2026-02-01T00:00:00.000Z",
						valid_to: "2026-01-01T00:00:00.000Z",
					},
					withEntryHandlerDeps({
						checkPolicy: async () => {},
						createAndEmbed: async () => ({ id: "e-1" }),
						notifyResourceChange: () => {},
						logEvent: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid validity interval (valid_to must be >= valid_from)",
			retryable: false,
		});
	});
	test("relate create rejects invalid validity interval", async () => {
		let createCalled = false;
		await expect(
				handleRelateCreate(
					{ subject: "S", predicate: "P", object: "O", valid_from: "still-bad" },
					withGraphHandlerDeps({
						checkPolicy: async () => {},
						createTriple: async () => {
							createCalled = true;
							return { id: "t-1" };
						},
						notifyResourceChange: () => {},
						logEvent: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid valid_from (must be ISO-8601)",
			retryable: false,
		});
		expect(createCalled).toBe(false);
	});
	test("relate conflict rejects invalid validity interval", async () => {
		let saveCalled = false;
		await expect(
			handleRelateConflict(
					{
						subject: "S",
						predicate: "P",
						object: "O",
						valid_to: "bogus-date",
						conflict: { conflict_id: "c-1", scope: "subject+predicate" },
					},
					withGraphHandlerDeps({
						checkPolicy: async () => {},
						saveConflict: async () => {
							saveCalled = true;
						},
						logEvent: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid valid_to (must be ISO-8601)",
			retryable: false,
		});
		expect(saveCalled).toBe(false);
	});
	test("update_triple rejects invalid validity interval", async () => {
		await expect(
				handleUpdateTriple(
					{ id: "t-1", valid_to: "bad-date" },
					withGraphHandlerDeps({
						checkPolicy: async () => {},
						updateTriple: async () => ({ id: "t-1" }),
						notifyResourceChange: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid valid_to (must be ISO-8601)",
			retryable: false,
		});
	});
	test("relate create rejects valid_to earlier than valid_from", async () => {
		await expect(
			handleRelateCreate(
					{
						subject: "S",
						predicate: "P",
						object: "O",
						valid_from: "2026-02-01T00:00:00.000Z",
						valid_to: "2026-01-01T00:00:00.000Z",
					},
					withGraphHandlerDeps({
						checkPolicy: async () => {},
						createTriple: async () => ({ id: "t-1" }),
						notifyResourceChange: () => {},
						logEvent: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid validity interval (valid_to must be >= valid_from)",
			retryable: false,
		});
	});
	test("store accepts valid_to=infinite without coercing raw input", async () => {
		let received = null;
			await handleStore(
				{ topic: "topic", content: "content", valid_to: "infinite" },
				withEntryHandlerDeps({
					checkPolicy: async () => {},
					createAndEmbed: async (params) => {
						received = params;
						return { id: "e-1" };
					},
					notifyResourceChange: () => {},
					logEvent: () => {},
					formatResult: (_text, data) => data,
				}),
			);
		expect(received).not.toBeNull();
		expect(received.valid_to).toBe("infinite");
	});
	test("store rejects non-numeric ttl_seconds string", async () => {
		await expect(
				handleStore(
					{ topic: "topic", content: "content", ttl_seconds: "5s" },
					withEntryHandlerDeps({
						checkPolicy: async () => {},
						createAndEmbed: async () => ({ id: "e-1" }),
						notifyResourceChange: () => {},
						logEvent: () => {},
						formatResult: (_text, data) => data,
					}),
				),
			).rejects.toEqual({
			code: "validation",
			message: "Invalid ttl_seconds (must be positive integer)",
			retryable: false,
		});
	});
});
