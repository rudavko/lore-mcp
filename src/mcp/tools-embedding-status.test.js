/** @implements NFR-004, FR-001, FR-012 — Verify embedding status propagation for store/update flows and graceful failure signaling. */
import { describe, expect, test } from "bun:test";
import { handleStore } from "./tools-entry-store.efct.js";
import { handleUpdate } from "./tools-entry-update.efct.js";
import { withEntryHandlerDeps } from "./tools-handler.test-helpers.js";
function extractData(result) {
	return result;
}
describe("mcp/tools.efct embedding status contract", () => {
	test("store forwards wait_for_embedding arg to createAndEmbed", async () => {
		let seenWait = undefined;
		await handleStore(
			{ topic: "topic", content: "content", wait_for_embedding: true },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				createAndEmbed: async (params) => {
					seenWait = params.wait_for_embedding;
					return {
						id: "e-1",
						topic: "topic",
						content: "content",
						embedding_status: "ready",
					};
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		expect(seenWait).toBe(true);
	});
	test("store coerces ttl_seconds numeric string before createAndEmbed", async () => {
		let seenTtl = undefined;
		await handleStore(
			{ topic: "topic", content: "content", ttl_seconds: "5" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				createAndEmbed: async (params) => {
					seenTtl = params.ttl_seconds;
					return {
						id: "e-1",
						topic: "topic",
						content: "content",
						embedding_status: "pending",
					};
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		expect(seenTtl).toBe(5);
	});
	test("store success returns embedding_status=pending and hides internal flags", async () => {
		const result = await handleStore(
			{ topic: "topic", content: "content" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				createAndEmbed: async () => ({
					id: "e-1",
					topic: "topic",
					content: "content",
					_embedding_sync_failed: false,
				}),
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const data = extractData(result);
		expect(data.embedding_status).toBe("pending");
		expect(data.valid_to_state).toBeUndefined();
		expect("_embedding_sync_failed" in data).toBe(false);
		expect("partial_failure" in data).toBe(false);
	});
	test("store surfaces defaults_applied when type axes are omitted", async () => {
		const result = await handleStore(
			{ topic: "topic", content: "content" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				createAndEmbed: async () => ({
					id: "e-1",
					topic: "topic",
					content: "content",
					knowledge_type: "observation",
					memory_type: "fleeting",
				}),
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const data = extractData(result);
		expect(data.defaults_applied).toEqual({
			knowledge_type: "observation",
			memory_type: "fleeting",
			set_type_nudge: "Use set_type to classify and retain this entry intentionally.",
		});
	});
	test("store embedding failure returns embedding_status=failed", async () => {
		const result = await handleStore(
			{ topic: "topic", content: "content" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				createAndEmbed: async () => ({
					id: "e-1",
					topic: "topic",
					content: "content",
					_embedding_sync_failed: true,
				}),
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const data = extractData(result);
		expect(data.embedding_status).toBe("failed");
		expect(data.valid_to_state).toBeUndefined();
		expect("_embedding_sync_failed" in data).toBe(false);
		expect("partial_failure" in data).toBe(false);
	});
	test("update success returns embedding_status=pending", async () => {
		const result = await handleUpdate(
			{ id: "e-1", topic: "topic", content: "content" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				updateAndEmbed: async () => ({
					id: "e-1",
					topic: "topic",
					content: "content",
					_embedding_sync_failed: false,
				}),
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const data = extractData(result);
		expect(data.embedding_status).toBe("pending");
		expect(data.valid_to_state).toBeUndefined();
		expect("_embedding_sync_failed" in data).toBe(false);
		expect("partial_failure" in data).toBe(false);
	});
	test("update forwards wait_for_embedding arg to updateAndEmbed", async () => {
		let seenWait = undefined;
		await handleUpdate(
			{ id: "e-1", topic: "topic", content: "content", wait_for_embedding: true },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				updateAndEmbed: async (_id, params) => {
					seenWait = params.wait_for_embedding;
					return {
						id: "e-1",
						topic: "topic",
						content: "content",
						embedding_status: "ready",
					};
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		expect(seenWait).toBe(true);
	});
	test("update coerces ttl_seconds numeric string before updateAndEmbed", async () => {
		let seenTtl = undefined;
		await handleUpdate(
			{ id: "e-1", topic: "topic", content: "content", ttl_seconds: "7" },
			withEntryHandlerDeps({
				checkPolicy: async () => {},
				updateAndEmbed: async (_id, params) => {
					seenTtl = params.ttl_seconds;
					return {
						id: "e-1",
						topic: "topic",
						content: "content",
						embedding_status: "pending",
					};
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		expect(seenTtl).toBe(7);
	});
});
