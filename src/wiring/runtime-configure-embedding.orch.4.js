/** @implements FR-001 — Embedding lifecycle runtime assembly for create-and-ingest flows. */
import { nowIso, parsePositiveInteger } from "./runtime-value-helpers.orch.3.js";

function createEntryWithEmbeddingRuntime({ db, env, std, createEntry, syncEmbedding }) {
	const embeddingMaxRetries = parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, std);
	const updateEmbeddingState = async (id, status, retryCount, errorMessage) => {
		await db
			.prepare(`UPDATE entries
				 SET embedding_status = ?,
				     embedding_retry_count = ?,
				     embedding_last_error = ?,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
			.bind(status, retryCount, errorMessage, nowIso(std), id)
			.run();
	};
	const setEmbeddingPendingForIngestion = async (id) => {
		await updateEmbeddingState(id, "pending", 0, null);
	};
	const markEmbeddingReadyForIngestion = async (id) => {
		await updateEmbeddingState(id, "ready", 0, null);
	};
	const markEmbeddingFailureForIngestion = async (id, error) => {
		const row = await db
			.prepare(`SELECT embedding_retry_count FROM entries WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
			.bind(id)
			.first();
		if (row === null) {
			return;
		}
		const current = typeof row.embedding_retry_count === "number" ? row.embedding_retry_count : 0;
		const nextRetryCount = current + 1;
		const nextStatus = nextRetryCount >= embeddingMaxRetries ? "failed" : "pending";
		const errorMessage =
			typeof error === "object" && error !== null && typeof error.message === "string"
				? error.message
				: std.String(error);
		await updateEmbeddingState(id, nextStatus, nextRetryCount, errorMessage);
	};
	return async (params) => {
		const entry = await createEntry(params);
		await setEmbeddingPendingForIngestion(entry.id);
		try {
			await syncEmbedding(entry.id, entry.topic + " " + entry.content);
			await markEmbeddingReadyForIngestion(entry.id);
		} catch (error) {
			await markEmbeddingFailureForIngestion(entry.id, error);
		}
		return entry;
	};
}

export { createEntryWithEmbeddingRuntime };
