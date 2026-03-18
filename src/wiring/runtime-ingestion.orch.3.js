/** @implements FR-003 — Ingestion task orchestration shared by runtime and worker jobs. */
import { jsonStringifyOrNull, nowIso, validationError } from "./runtime-value-helpers.orch.3.js";

function buildIngestionOps(ctx) {
	const isDuplicate = async (content) => {
		const row = await ctx.db
			.prepare(`SELECT id FROM entries WHERE content = ? AND deleted_at IS NULL LIMIT 1`)
			.bind(content)
			.first();
		return row !== null;
	};
	const insertTask = async (id, status, totalItems, inputUri) => {
		const now = nowIso(ctx.std);
		await ctx.db
			.prepare(`INSERT INTO ingestion_tasks (id, status, input_uri, total_items, processed_items, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 0, ?, ?)`)
			.bind(id, status, inputUri, totalItems, now, now)
			.run();
	};
	const updateTaskProgress = async (id, processedItems) => {
		await ctx.db
			.prepare(`UPDATE ingestion_tasks SET processed_items = ?, updated_at = ? WHERE id = ?`)
			.bind(processedItems, nowIso(ctx.std), id)
			.run();
	};
	const updateTaskStatus = async (id, status, error) => {
		await ctx.db
			.prepare(`UPDATE ingestion_tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?`)
			.bind(status, error ?? null, nowIso(ctx.std), id)
			.run();
	};
	const serializeInputUri = (content, source) => jsonStringifyOrNull({ content, source }, ctx.std);
	const parseInputUri = (raw) => {
		const parsed = ctx.std.json.parse(raw);
		if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
			return null;
		}
		const source = typeof parsed.value.source === "string" ? parsed.value.source : undefined;
		return typeof parsed.value.content === "string" ? { content: parsed.value.content, source } : null;
	};
	const findPendingTask = async () => {
		const row = await ctx.db
			.prepare(`SELECT id, status, processed_items, input_uri
			 FROM ingestion_tasks
			 WHERE status IN ('pending', 'processing')
			 ORDER BY created_at ASC
			 LIMIT 1`)
			.first();
		if (row === null) {
			return null;
		}
		return {
			id: row.id,
			status: row.status,
			processed_items: row.processed_items || 0,
			input_uri: row.input_uri || null,
		};
	};
	const getTask = async (id) => {
		const row = await ctx.db
			.prepare(`SELECT id, status, total_items, processed_items, error FROM ingestion_tasks WHERE id = ?`)
			.bind(id)
			.first();
		if (row === null) {
			return null;
		}
		return {
			id: row.id,
			status: row.status,
			total_items: row.total_items || 0,
			processed_items: row.processed_items || 0,
			error: row.error || null,
		};
	};
	const createEntryForIngestion = async (params) => {
		await ctx.createEntry(params);
	};
	const ingestSync = async (content, source) => {
		return await ctx.ingestSyncOrch(content, source, {
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			isDuplicate,
			createEntry: createEntryForIngestion,
			insertTask,
			updateTaskProgress,
			updateTaskStatus,
			chunkText: ctx.chunkText,
			extractChunkTopic: ctx.extractChunkTopic,
		});
	};
	const ingestAsync = async (content, source) => {
		if (content.length > ctx.maxStorableContent) {
			throw validationError("Content too large for async ingestion (" + content.length + " bytes)");
		}
		return await ctx.ingestAsyncOrch(content, source, {
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			insertTask,
			chunkText: ctx.chunkText,
			serializeInputUri,
		});
	};
	const runIngestionBatch = async () => {
		return await ctx.processIngestionBatchOrch({
			findPendingTask,
			parseInputUri,
			isDuplicate,
			createEntry: createEntryForIngestion,
			updateTaskProgress,
			updateTaskStatus,
			chunkText: ctx.chunkText,
			extractChunkTopic: ctx.extractChunkTopic,
		});
	};
	const getIngestionStatus = async (taskId) => {
		return await ctx.getIngestionStatusOrch(taskId, { getTask });
	};
	return {
		getIngestionStatus,
		ingestAsync,
		ingestSync,
		runIngestionBatch,
		shouldProcessAsync: ctx.shouldProcessAsync,
	};
}

export { buildIngestionOps };
