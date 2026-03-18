/** @implements FR-001 — Tool-side embedding helpers for store/update flows. */
import { nowIso } from "./runtime-value-helpers.orch.3.js";

function createEmbeddingToolHelpers(ctx) {
	const embeddingMaxRetries = ctx.parsePositiveInteger(ctx.env.EMBEDDING_MAX_RETRIES, 5, ctx.std);
	const setEmbeddingPending = async (id) => {
		await ctx.env.DB
			.prepare(`UPDATE entries
				 SET embedding_status = 'pending',
				     embedding_retry_count = 0,
				     embedding_last_error = NULL,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
			.bind(nowIso(ctx.std), id)
			.run();
	};
	const markEmbeddingReady = async (id) => {
		await ctx.env.DB
			.prepare(`UPDATE entries
				 SET embedding_status = 'ready',
				     embedding_retry_count = 0,
				     embedding_last_error = NULL,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
			.bind(nowIso(ctx.std), id)
			.run();
		return "ready";
	};
	const markEmbeddingAttemptFailure = async (id, error) => {
		const row = await ctx.env.DB
			.prepare(`SELECT embedding_retry_count FROM entries WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
			.bind(id)
			.first();
		if (row === null) {
			return "pending";
		}
		const current = typeof row.embedding_retry_count === "number" ? row.embedding_retry_count : 0;
		const nextRetryCount = current + 1;
		const nextStatus = nextRetryCount >= embeddingMaxRetries ? "failed" : "pending";
		const errorMessage =
			typeof error === "object" && error !== null && typeof error.message === "string"
				? error.message
				: ctx.std.String(error);
		await ctx.env.DB
			.prepare(`UPDATE entries
				 SET embedding_status = ?,
				     embedding_retry_count = ?,
				     embedding_last_error = ?,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
			.bind(nextStatus, nextRetryCount, errorMessage, nowIso(ctx.std), id)
			.run();
		return nextStatus;
	};
	const createAndEmbed = async (params) => {
		const entry = await ctx.createEntry(params);
		await setEmbeddingPending(entry.id);
		if (params.wait_for_embedding !== true) {
			return { ...entry, embedding_status: "pending", _embedding_sync_failed: false };
		}
		try {
			await ctx.syncEmbedding(entry.id, ctx.std.String(entry.topic ?? "") + " " + ctx.std.String(entry.content ?? ""));
			return {
				...entry,
				embedding_status: await markEmbeddingReady(entry.id),
				_embedding_sync_failed: false,
			};
		} catch (error) {
			const embeddingStatus = await markEmbeddingAttemptFailure(entry.id, error);
			ctx.logEvent("warning", {
				op: "store",
				id: entry.id,
				stage: "syncEmbedding",
				ok: false,
				embedding_status: embeddingStatus,
			});
			return { ...entry, embedding_status: embeddingStatus, _embedding_sync_failed: true };
		}
	};
	const updateAndEmbed = async (id, params) => {
		const entry = await ctx.updateEntry(id, params);
		await setEmbeddingPending(entry.id);
		if (params.wait_for_embedding !== true) {
			return { ...entry, embedding_status: "pending", _embedding_sync_failed: false };
		}
		try {
			await ctx.syncEmbedding(entry.id, ctx.std.String(entry.topic ?? "") + " " + ctx.std.String(entry.content ?? ""));
			return {
				...entry,
				embedding_status: await markEmbeddingReady(entry.id),
				_embedding_sync_failed: false,
			};
		} catch (error) {
			const embeddingStatus = await markEmbeddingAttemptFailure(entry.id, error);
			ctx.logEvent("warning", {
				op: "update",
				id: entry.id,
				stage: "syncEmbedding",
				ok: false,
				embedding_status: embeddingStatus,
			});
			return { ...entry, embedding_status: embeddingStatus, _embedding_sync_failed: true };
		}
	};
	return {
		createAndEmbed,
		markEmbeddingAttemptFailure,
		markEmbeddingReady,
		setEmbeddingPending,
		updateAndEmbed,
	};
}

export { createEmbeddingToolHelpers };
