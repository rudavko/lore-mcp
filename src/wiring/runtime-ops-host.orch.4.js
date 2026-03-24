/** @implements FR-001 — Host-scoped runtime operation inputs and adapters. */
import { parsePositiveInteger } from "./runtime-value-helpers.orch.3.js";

function createRuntimeOpsHostDeps(env, deps) {
	return {
		db: env.DB,
		embeddingMaxRetries: parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, deps.std),
		semanticMinScore: env.SEMANTIC_MIN_SCORE,
		aiRun: env.AI ? (model, input) => env.AI.run(model, input) : null,
		vectorQuery: env.VECTORIZE_INDEX
			? (vector, options) => env.VECTORIZE_INDEX.query(vector, options)
			: null,
		vectorizeUpsert: env.VECTORIZE_INDEX ? (vectors) => env.VECTORIZE_INDEX.upsert(vectors) : null,
	};
}

export { createRuntimeOpsHostDeps };
