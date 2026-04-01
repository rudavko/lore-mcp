/** @implements FR-002 — Core embedding sync must consume an injected model id instead of a cloud-specific literal. */
import { describe, expect, test } from "bun:test";
import { syncEmbedding } from "./search.ops.efct.js";

describe("db/search.ops syncEmbedding", () => {
	test("uses the injected embedding model id", async () => {
		const aiCalls = [];
		const upserts = [];

		await syncEmbedding("entry-1", "hello world", {
			embeddingModelId: "@cf/custom-model",
			aiRun: async (model, input) => {
				aiCalls.push({ model, input });
				return { data: [[0.1, 0.2, 0.3]] };
			},
			vectorizeUpsert: async (vectors) => {
				upserts.push(vectors);
			},
		});

		expect(aiCalls).toEqual([
			{ model: "@cf/custom-model", input: { text: ["hello world"] } },
		]);
		expect(upserts).toEqual([[{ id: "entry-1", values: [0.1, 0.2, 0.3] }]]);
	});
});
