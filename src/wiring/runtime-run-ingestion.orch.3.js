/** @implements FR-003 — Scheduled ingestion/embedding retry runtime orchestration. */
import {
	computeExpiresAt,
	jsonStringifyOrNull,
	noThrowValidation,
	nowIso,
	validationError,
} from "./runtime-value-helpers.orch.3.js";
import { createRunIngestionHostDeps } from "./runtime-ingestion-host.orch.4.js";
import { buildIngestionOps } from "./runtime-ingestion.orch.3.js";
import { createUlidGenerator, makeNotifyResourceChange } from "./runtime-surface.orch.3.js";

function makeRunLoreIngestion(deps) {
	const generateId = createUlidGenerator(
		deps.formatUlid,
		deps.nowMs,
		deps.random,
		deps.std.Math.floor,
	);
	return async (env, server) => {
		const host = createRunIngestionHostDeps(env, deps);
		const db = host.db;
		const notifyResourceChange = makeNotifyResourceChange(server, deps.resolveEntityUri, deps.transactionsUri);
		const embeddingMaxRetries = host.embeddingMaxRetries;
		const embeddingRetryBatchSize = host.embeddingRetryBatchSize;
		const embeddingRetryStaleMs = host.embeddingRetryStaleMs;
		const setEmbeddingPending = async (id) => {
			await db.prepare(`UPDATE entries
				 SET embedding_status = 'pending',
				     embedding_last_error = NULL,
				     embedding_last_attempt_at = ?,
				     embedding_retry_count = 0
				 WHERE id = ? AND deleted_at IS NULL`)
				.bind(nowIso(deps.std), id)
				.run();
		};
		const markEmbeddingReady = async (id) => {
			await db.prepare(`UPDATE entries
				 SET embedding_status = 'ready',
				     embedding_retry_count = 0,
				     embedding_last_error = NULL,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
				.bind(nowIso(deps.std), id)
				.run();
		};
		const markEmbeddingFailure = async (id, error) => {
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
					: deps.std.String(error);
			await db.prepare(`UPDATE entries
				 SET embedding_status = ?,
				     embedding_retry_count = ?,
				     embedding_last_error = ?,
				     embedding_last_attempt_at = ?
				 WHERE id = ? AND deleted_at IS NULL`)
				.bind(nextStatus, nextRetryCount, errorMessage, nowIso(deps.std), id)
				.run();
		};
		const syncEmbedding = async (id, text) => {
			await host.syncEmbedding(id, text);
		};
		const failExhaustedPendingEmbeddings = async () => {
			await db.prepare(`UPDATE entries
				 SET embedding_status = 'failed',
				     embedding_last_error = COALESCE(embedding_last_error, 'max retries exceeded'),
				     embedding_last_attempt_at = COALESCE(embedding_last_attempt_at, ?)
				 WHERE deleted_at IS NULL
				   AND embedding_status = 'pending'
				   AND embedding_retry_count >= ?`)
				.bind(nowIso(deps.std), embeddingMaxRetries)
				.run();
		};
		const loadRetryableEmbeddingRows = async () => {
			const staleBefore = new deps.std.Date(deps.nowMs() - embeddingRetryStaleMs).toISOString();
			const rows = await db.prepare(`SELECT id, topic, content
				 FROM entries
				 WHERE deleted_at IS NULL
				   AND embedding_status = 'pending'
				   AND embedding_retry_count < ?
				   AND (embedding_last_attempt_at IS NULL OR embedding_last_attempt_at <= ?)
				 ORDER BY COALESCE(embedding_last_attempt_at, created_at) ASC
				 LIMIT ?`)
				.bind(embeddingMaxRetries, staleBefore, embeddingRetryBatchSize)
				.all();
			return rows.results;
		};
		const processRetryableEmbeddingRows = async (pendingItems) => {
			for (let i = 0; i < pendingItems.length; i++) {
				const item = pendingItems[i];
				if (
					typeof item.id !== "string" ||
					typeof item.topic !== "string" ||
					typeof item.content !== "string"
				) {
					continue;
				}
				try {
					await syncEmbedding(item.id, item.topic + " " + item.content);
					await markEmbeddingReady(item.id);
				} catch (error) {
					await markEmbeddingFailure(item.id, error);
				}
			}
		};
		const countRetryableEmbeddings = async () => {
			const countRow = await db.prepare(`SELECT COUNT(*) AS c
				 FROM entries
				 WHERE deleted_at IS NULL
				   AND embedding_status = 'pending'
				   AND embedding_retry_count < ?`)
				.bind(embeddingMaxRetries)
				.first();
			return countRow !== null && typeof countRow.c === "number" ? countRow.c : 0;
		};
		const runEmbeddingRetryBatch = async () => {
			await failExhaustedPendingEmbeddings();
			await processRetryableEmbeddingRows(await loadRetryableEmbeddingRows());
			return await countRetryableEmbeddings();
		};
		const createEntry = async (params) => {
			const validation = deps.validateEntryFields({ topic: params.topic, content: params.content });
			if (!validation.ok) {
				throw validationError((validation.error && validation.error.message) || "Invalid entry");
			}
			return await deps.entriesOrchCreate(params, {
				validateEntryFields: deps.validateEntryFields,
				validateCreateEntryInput: deps.validateCreateEntryInput,
				deriveValidToStateFromInput: deps.deriveValidToStateFromInput,
				resolveCreateAutoLinkState: deps.resolveCreateAutoLinkState,
				buildCreateSnapshots: deps.buildCreateSnapshots,
				buildEntryObject: deps.buildEntryObject,
				insertEntryRow: deps.insertEntryRow,
				generateId,
				now: () => nowIso(deps.std),
				computeExpiresAt: (startIso, ttlSeconds) =>
					computeExpiresAt(startIso, ttlSeconds * 1000, deps.std),
				serialize: (value) => jsonStringifyOrNull(value, deps.std),
				db,
				throwValidation: noThrowValidation,
			});
		};
		const createEntryForIngestion = async (params) => {
			const entry = await createEntry(params);
			await setEmbeddingPending(entry.id);
			try {
				await syncEmbedding(entry.id, entry.topic + " " + entry.content);
				await markEmbeddingReady(entry.id);
			} catch (error) {
				await markEmbeddingFailure(entry.id, error);
			}
			return entry;
		};
		const ingestion = buildIngestionOps({
			db,
			std: deps.std,
			generateId,
			createEntry: createEntryForIngestion,
			shouldProcessAsync: deps.shouldProcessAsync,
			ingestSyncOrch: deps.ingestSyncOrch,
			ingestAsyncOrch: deps.ingestAsyncOrch,
			processIngestionBatchOrch: deps.processIngestionBatchOrch,
			getIngestionStatusOrch: deps.getIngestionStatusOrch,
			chunkText: deps.chunkText,
			extractChunkTopic: deps.extractChunkTopic,
			maxStorableContent: deps.maxStorableContent,
		});
		const result = await ingestion.runIngestionBatch();
		const pendingEmbeddingsRemaining = await runEmbeddingRetryBatch();
		if (result.processed > 0) {
			notifyResourceChange("entry");
		}
		return result.remaining + pendingEmbeddingsRemaining;
	};
}

export { makeRunLoreIngestion };
