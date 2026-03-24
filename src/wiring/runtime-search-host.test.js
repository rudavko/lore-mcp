/** @implements NFR-001 — Verify host search adapters isolate AI/Vectorize-specific behavior. */
import { describe, expect, test } from "bun:test";
import {
	createSemanticSearchPort,
	createSyncEmbeddingPort,
	hasSemanticSearchCapability,
} from "./runtime-search-host.orch.4.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

const std = createGlobalTestStd(globalThis);

describe("wiring/runtime-search-host", () => {
	test("reports semantic capability only when both host adapters exist", () => {
		expect(hasSemanticSearchCapability({ aiRun: null, vectorQuery: null })).toBe(false);
		expect(hasSemanticSearchCapability({ aiRun: async () => ({}), vectorQuery: null })).toBe(false);
		expect(
			hasSemanticSearchCapability({
				aiRun: async () => ({}),
				vectorQuery: async () => ({ matches: [] }),
			}),
		).toBe(true);
	});

	test("semantic search returns filtered matches through host adapters", async () => {
		const semanticSearch = createSemanticSearchPort({
			aiRun: async () => ({ data: [[0.1, 0.2, 0.3]] }),
			vectorQuery: async () => ({
				matches: [
					{ id: "keep", score: 0.7 },
					{ id: "drop", score: 0.2 },
				],
			}),
			semanticMinScore: "0.5",
			std,
		});

		await expect(semanticSearch("query", 5)).resolves.toEqual([{ id: "keep", score: 0.7 }]);
	});

	test("sync embedding forwards host adapters into orchestration", async () => {
		const calls = [];
		const aiRun = async () => ({ data: [] });
		const vectorizeUpsert = async () => undefined;
		const syncEmbedding = createSyncEmbeddingPort({
			aiRun,
			vectorizeUpsert,
			syncEmbeddingOrch: async (id, text, deps) => {
				calls.push({ id, text, deps });
			},
		});

		await syncEmbedding("entry-1", "body");

		expect(calls).toHaveLength(1);
		expect(calls[0].deps.aiRun).toBe(aiRun);
		expect(calls[0].deps.vectorizeUpsert).toBe(vectorizeUpsert);
	});
});
