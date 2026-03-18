/** @implements FR-010, NFR-002 — Verify ingestion embedding-retry behavior for long-term reliability. */
import { describe, expect, test } from "bun:test";
import { makeRunLoreIngestion } from "./runtime.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";
const std = createGlobalTestStd(globalThis);
const deriveValidToStateFromInput = (value) => {
	if (value === undefined) {
		return { validTo: undefined, validToState: "unspecified" };
	}
	if (value === null) {
		return { validTo: null, validToState: "unspecified" };
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "infinite" || normalized === "infinity" || normalized === "forever") {
		return { validTo: null, validToState: "infinite" };
	}
	return { validTo: value, validToState: "bounded" };
};
function createDbHarness(pendingRows, retryCountById, pendingCountAfter) {
	const calls = [];
	const db = {
		prepare: (sql) => {
			let bound = [];
			const stmt = {
				bind: (...args) => {
					bound = args;
					return stmt;
				},
				run: async () => {
					calls.push({ sql, args: bound, kind: "run" });
					return { success: true };
				},
				first: async () => {
					calls.push({ sql, args: bound, kind: "first" });
					if (sql.indexOf("SELECT embedding_retry_count FROM entries") >= 0) {
						const id = bound[0];
						return { embedding_retry_count: retryCountById[id] ?? 0 };
					}
					if (sql.indexOf("SELECT COUNT(*) AS c") >= 0) {
						return { c: pendingCountAfter };
					}
					return null;
				},
				all: async () => {
					calls.push({ sql, args: bound, kind: "all" });
					if (sql.indexOf("SELECT id, topic, content") >= 0) {
						return { results: pendingRows };
					}
					return { results: [] };
				},
			};
			return stmt;
		},
	};
	return { db, calls };
}
function createRunLoreIngestion(syncEmbeddingOrch) {
	return makeRunLoreIngestion({
		std,
		nowMs: Date.now,
		random: Math.random,
		formatUlid: () => "01TESTULID0000000000000000",
		entriesOrchCreate: async () => ({}),
		validateEntryFields: () => ({ ok: true }),
		deriveValidToStateFromInput,
		buildEntryObject: () => ({}),
		insertEntryRow: async () => {},
		syncEmbeddingOrch,
		shouldProcessAsync: () => false,
		ingestSyncOrch: async () => ({ task_id: "t", entries_created: 0, duplicates_skipped: 0 }),
		ingestAsyncOrch: async () => ({ task_id: "t" }),
		processIngestionBatchOrch: async () => ({ processed: 0, remaining: 0 }),
		getIngestionStatusOrch: async () => null,
		chunkText: () => [],
		extractChunkTopic: () => "topic",
		maxStorableContent: 10000,
		resolveEntityUri: () => "knowledge://entries",
		transactionsUri: "knowledge://transactions",
	});
}
describe("wiring/runtime.efct embedding retry pipeline", () => {
	test("retries stale pending entries and increments retry count on failure", async () => {
		const { db, calls } = createDbHarness(
			[
				{ id: "entry-ok", topic: "topic ok", content: "content ok" },
				{ id: "entry-fail", topic: "topic fail", content: "content fail" },
			],
			{ "entry-fail": 1 },
			1,
		);
		const syncedIds = [];
		const runLoreIngestion = createRunLoreIngestion(async (id) => {
			syncedIds.push(id);
			if (id === "entry-fail") {
				return Promise.reject(new Error("forced embedding failure"));
			}
		});
		const remaining = await runLoreIngestion(
			{
				DB: db,
				AI: null,
				VECTORIZE_INDEX: null,
				EMBEDDING_MAX_RETRIES: "3",
				EMBEDDING_RETRY_BATCH_SIZE: "10",
				EMBEDDING_RETRY_STALE_MS: "1",
			},
			{},
		);
		expect(remaining).toBe(1);
		expect(syncedIds).toEqual(["entry-ok", "entry-fail"]);
		const readyUpdate = calls.find(
			(call) =>
				call.kind === "run" &&
				call.sql.indexOf("SET embedding_status = 'ready'") >= 0 &&
				call.args[1] === "entry-ok",
		);
		expect(readyUpdate).toBeTruthy();
		const failedAttemptUpdate = calls.find(
			(call) =>
				call.kind === "run" &&
				call.sql.indexOf("SET embedding_status = ?") >= 0 &&
				call.args[0] === "pending" &&
				call.args[1] === 2 &&
				call.args[4] === "entry-fail",
		);
		expect(failedAttemptUpdate).toBeTruthy();
	});
	test("marks over-retry pending rows as terminal failed before retry loop", async () => {
		const { db, calls } = createDbHarness([], {}, 0);
		const runLoreIngestion = createRunLoreIngestion(async () => {});
		const remaining = await runLoreIngestion(
			{
				DB: db,
				AI: null,
				VECTORIZE_INDEX: null,
				EMBEDDING_MAX_RETRIES: "3",
				EMBEDDING_RETRY_BATCH_SIZE: "10",
				EMBEDDING_RETRY_STALE_MS: "1",
			},
			{},
		);
		expect(remaining).toBe(0);
		const terminalSweep = calls.find(
			(call) =>
				call.kind === "run" &&
				call.sql.indexOf("SET embedding_status = 'failed'") >= 0 &&
				call.args[1] === 3,
		);
		expect(terminalSweep).toBeTruthy();
	});
});
