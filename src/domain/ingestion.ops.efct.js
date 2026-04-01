/** @implements FR-017, FR-010, NFR-002 — Ingestion effect operations for sync/async import-style loading with retry-safe status tracking. */
/** Synchronous ingestion for small inputs. Deduplicates by content. */
export async function ingestSync(content, source, deps) {
	const taskId = deps.generateId();
	const chunks = deps.chunkText(content);
	await deps.insertTask(taskId, "processing", chunks.length, null);
	let created = 0;
	let duplicates = 0;
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const isDup = await deps.isDuplicate(chunk);
		if (isDup) {
			duplicates = duplicates + 1;
		} else {
			const topic = deps.extractChunkTopic(chunk);
			await deps.createEntry({
				topic: topic,
				content: chunk,
				source: source !== undefined ? source : "ingestion:" + taskId,
				tags: ["ingested"],
			});
			created = created + 1;
		}
		await deps.updateTaskProgress(taskId, created + duplicates);
	}
	await deps.updateTaskStatus(taskId, "completed");
	return { task_id: taskId, entries_created: created, duplicates_skipped: duplicates };
}
/** Create an async ingestion task. Content stored in inputUri for later batch processing. */
export async function ingestAsync(content, source, deps) {
	const taskId = deps.generateId();
	const chunks = deps.chunkText(content);
	const inputUri = deps.serializeInputUri(content, source);
	await deps.insertTask(taskId, "pending", chunks.length, inputUri);
	return { task_id: taskId };
}
// CONTEXT: processIngestionBatch is called from a Durable Object alarm handler.
// DOs guarantee single-threaded execution — only one alarm/request handler runs
// at a time. So concurrent access is impossible by architecture.
/** Process a batch of pending ingestion work. Called by DO alarm. */
export async function processIngestionBatch(deps) {
	const BATCH_SIZE = 10;
	const task = await deps.findPendingTask();
	if (task === null) {
		return { processed: 0, remaining: 0 };
	}
	const taskId = task.id;
	const processedSoFar = task.processed_items;
	const inputUri = task.input_uri;
	if (inputUri === null) {
		await deps.updateTaskStatus(taskId, "failed", "No input data");
		return { processed: 0, remaining: 0 };
	}
	const parsed = deps.parseInputUri(inputUri);
	if (parsed === null) {
		await deps.updateTaskStatus(taskId, "failed", "Invalid input data");
		return { processed: 0, remaining: 0 };
	}
	const content = parsed.content;
	const source = parsed.source;
	const chunks = deps.chunkText(content);
	const remaining = [];
	for (let i = processedSoFar; i < chunks.length; i++) {
		remaining.push(chunks[i]);
	}
	const batchEnd = remaining.length < BATCH_SIZE ? remaining.length : BATCH_SIZE;
	const batch = [];
	for (let i = 0; i < batchEnd; i++) {
		batch.push(remaining[i]);
	}
	await deps.updateTaskStatus(taskId, "processing");
	let processed = 0;
	for (let i = 0; i < batch.length; i++) {
		const isDup = await deps.isDuplicate(batch[i]);
		if (!isDup) {
			const topic = deps.extractChunkTopic(batch[i]);
			await deps.createEntry({
				topic: topic,
				content: batch[i],
				source: source !== undefined ? source : "ingestion:" + taskId,
				tags: ["ingested"],
			});
		}
		processed = processed + 1;
		await deps.updateTaskProgress(taskId, processedSoFar + processed);
	}
	const totalRemaining = remaining.length - processed;
	if (totalRemaining <= 0) {
		await deps.updateTaskStatus(taskId, "completed");
	}
	return { processed: processed, remaining: totalRemaining };
}
/** Get the status of an ingestion task. */
export async function getIngestionStatus(taskId, deps) {
	return deps.getTask(taskId);
}
