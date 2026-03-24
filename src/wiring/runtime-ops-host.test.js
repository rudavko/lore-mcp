/** @implements FR-001 — Verify runtime-ops host adapter translates env into stable ports. */
import { describe, expect, test } from "bun:test";
import { createRuntimeOpsHostDeps } from "./runtime-ops-host.orch.4.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";

const std = createGlobalTestStd(globalThis);

describe("wiring/runtime-ops-host", () => {
	test("maps DB, AI, Vectorize, semantic threshold, and retry config from env", async () => {
		const env = {
			DB: { label: "db" },
			AI: {
				run: async (model, input) => ({ model, input }),
			},
			VECTORIZE_INDEX: {
				query: async (vector, options) => ({ matches: [], vector, options }),
				upsert: async (vectors) => vectors.length,
			},
			SEMANTIC_MIN_SCORE: "0.77",
			EMBEDDING_MAX_RETRIES: "8",
		};
		const host = createRuntimeOpsHostDeps(env, { std });

		expect(host.db).toBe(env.DB);
		expect(host.embeddingMaxRetries).toBe(8);
		expect(host.semanticMinScore).toBe("0.77");
		expect(await host.aiRun("m", { x: 1 })).toEqual({ model: "m", input: { x: 1 } });
		expect(await host.vectorQuery([1, 2], { topK: 3 })).toEqual({
			matches: [],
			vector: [1, 2],
			options: { topK: 3 },
		});
		expect(await host.vectorizeUpsert([{ id: "a" }])).toBe(1);
	});
});
