/** @implements FR-003 — Verify ingestion host adapter builds stable runtime ports from env. */
import { describe, expect, test } from "bun:test";
import { createRunIngestionHostDeps } from "./runtime-ingestion-host.orch.4.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

const std = createGlobalTestStd(globalThis);

describe("wiring/runtime-ingestion-host", () => {
	test("parses retry settings and forwards AI/vector adapters into syncEmbedding", async () => {
		const calls = [];
		const env = {
			DB: { label: "db" },
			AI: {
				run: async (model, input) => ({ model, input }),
			},
			VECTORIZE_INDEX: {
				upsert: async (vectors) => vectors.length,
			},
			EMBEDDING_MAX_RETRIES: "7",
			EMBEDDING_RETRY_BATCH_SIZE: "11",
			EMBEDDING_RETRY_STALE_MS: "13",
		};
		const host = createRunIngestionHostDeps(env, {
			std,
			syncEmbeddingOrch: async (id, text, adapters) => {
				calls.push({ id, text, adapters });
				await adapters.aiRun("@cf/test", { text });
				await adapters.vectorizeUpsert([{ id }]);
			},
		});

		expect(host.db).toBe(env.DB);
		expect(host.embeddingMaxRetries).toBe(7);
		expect(host.embeddingRetryBatchSize).toBe(11);
		expect(host.embeddingRetryStaleMs).toBe(13);

		await host.syncEmbedding("entry-1", "hello");

		expect(calls).toHaveLength(1);
		expect(calls[0].id).toBe("entry-1");
		expect(calls[0].text).toBe("hello");
		expect(typeof calls[0].adapters.aiRun).toBe("function");
		expect(typeof calls[0].adapters.vectorizeUpsert).toBe("function");
	});
});
