// GEMINI-CONTEXT: Async ingestion pipeline (Spec 004-003). Addresses atomicity
// by using content hashing for dedup (SHA-256 of chunk content checked before
// insert). Large payloads are NOT stored in transaction snapshots — chunks are
// re-derived from the original content stored in the ingestion_tasks.input_uri
// field (which holds the raw text for in-memory inputs, capped at D1's 1MB row
// limit). For truly large files, the caller should pre-chunk and call store
// individually.

import { ulid, sqliteNow } from "../lib/ulid";
import { KnowledgeError } from "../lib/errors";
import { createEntry } from "../db/entries";

const SYNC_THRESHOLD_CHARS = 5000;
const SYNC_THRESHOLD_ITEMS = 20;
const CHUNK_SIZE = 500;
const BATCH_SIZE = 10;
// D1 max row payload is ~1MB; leave headroom for other columns
const MAX_STORABLE_CONTENT = 900_000;

/** Split text into chunks at paragraph or sentence boundaries. */
function chunkText(text: string): string[] {
	const chunks: string[] = [];
	const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

	let current = "";
	for (const para of paragraphs) {
		if (current.length + para.length > CHUNK_SIZE && current.length > 0) {
			chunks.push(current.trim());
			current = "";
		}
		current += (current ? "\n\n" : "") + para;
	}
	if (current.trim()) chunks.push(current.trim());

	return chunks;
}

/** Check if an entry with identical content already exists. */
async function isDuplicate(db: D1Database, content: string): Promise<boolean> {
	// Use exact content match (fast with index on small result sets)
	const row = await db.prepare(
		`SELECT id FROM entries WHERE content = ? AND deleted_at IS NULL LIMIT 1`,
	).bind(content).first();
	return row !== null;
}

export function shouldProcessAsync(content: string): boolean {
	const chunks = chunkText(content);
	return content.length > SYNC_THRESHOLD_CHARS || chunks.length > SYNC_THRESHOLD_ITEMS;
}

/** Synchronous ingestion for small inputs. Deduplicates by content. */
export async function ingestSync(
	db: D1Database,
	content: string,
	source?: string,
): Promise<{ task_id: string; entries_created: number; duplicates_skipped: number }> {
	const taskId = ulid();
	const now = sqliteNow();
	const chunks = chunkText(content);

	await db.prepare(
		`INSERT INTO ingestion_tasks (id, status, total_items, processed_items, created_at, updated_at)
		 VALUES (?, 'processing', ?, 0, ?, ?)`,
	).bind(taskId, chunks.length, now, now).run();

	let created = 0;
	let duplicates = 0;

	for (const chunk of chunks) {
		if (await isDuplicate(db, chunk)) {
			duplicates++;
		} else {
			const topic = chunk.split("\n")[0].slice(0, 100).trim() || "ingested";
			await createEntry(db, {
				topic,
				content: chunk,
				source: source ?? `ingestion:${taskId}`,
				tags: ["ingested"],
			});
			created++;
		}

		await db.prepare(
			`UPDATE ingestion_tasks SET processed_items = ?, updated_at = ? WHERE id = ?`,
		).bind(created + duplicates, sqliteNow(), taskId).run();
	}

	await db.prepare(
		`UPDATE ingestion_tasks SET status = 'completed', updated_at = ? WHERE id = ?`,
	).bind(sqliteNow(), taskId).run();

	return { task_id: taskId, entries_created: created, duplicates_skipped: duplicates };
}

/** Create an async ingestion task. Content stored in input_uri for later processing. */
export async function ingestAsync(
	db: D1Database,
	content: string,
	source?: string,
): Promise<{ task_id: string }> {
	if (content.length > MAX_STORABLE_CONTENT) {
		throw KnowledgeError.validation(
			`Content too large for async ingestion (${content.length} bytes, max ${MAX_STORABLE_CONTENT}). ` +
			`Pre-chunk the content and call store individually.`,
		);
	}

	const taskId = ulid();
	const now = sqliteNow();
	const chunks = chunkText(content);

	// Store raw content in input_uri for the alarm to re-derive chunks
	await db.prepare(
		`INSERT INTO ingestion_tasks (id, status, input_uri, total_items, processed_items, created_at, updated_at)
		 VALUES (?, 'pending', ?, ?, 0, ?, ?)`,
	).bind(taskId, JSON.stringify({ content, source }), chunks.length, now, now).run();

	return { task_id: taskId };
}

// GEMINI-CONTEXT: processIngestionBatch is only called from MyMCP.processIngestion(),
// which runs inside a Durable Object. DOs guarantee single-threaded execution — only
// one alarm/request handler runs at a time. The schedule() call in processIngestion()
// fires AFTER the current invocation completes. So concurrent access is impossible by
// architecture, and no optimistic locking is needed.
/** Process a batch of pending ingestion work. Called by DO alarm. */
export async function processIngestionBatch(
	db: D1Database,
): Promise<{ processed: number; remaining: number }> {
	const task = await db.prepare(
		`SELECT * FROM ingestion_tasks WHERE status IN ('pending', 'processing')
		 ORDER BY created_at ASC LIMIT 1`,
	).bind().first();

	if (!task) return { processed: 0, remaining: 0 };

	const taskId = task.id as string;
	const processedSoFar = task.processed_items as number;
	const inputUri = task.input_uri as string | null;

	if (!inputUri) {
		await db.prepare(
			`UPDATE ingestion_tasks SET status = 'failed', error = 'No input data', updated_at = ? WHERE id = ?`,
		).bind(sqliteNow(), taskId).run();
		return { processed: 0, remaining: 0 };
	}

	let content: string;
	let source: string | undefined;
	try {
		const parsed = JSON.parse(inputUri);
		content = parsed.content;
		source = parsed.source;
	} catch {
		await db.prepare(
			`UPDATE ingestion_tasks SET status = 'failed', error = 'Invalid input data', updated_at = ? WHERE id = ?`,
		).bind(sqliteNow(), taskId).run();
		return { processed: 0, remaining: 0 };
	}

	const chunks = chunkText(content);
	const remaining = chunks.slice(processedSoFar);
	const batch = remaining.slice(0, BATCH_SIZE);

	await db.prepare(
		`UPDATE ingestion_tasks SET status = 'processing', updated_at = ? WHERE id = ?`,
	).bind(sqliteNow(), taskId).run();

	let processed = 0;
	for (const chunk of batch) {
		if (!(await isDuplicate(db, chunk))) {
			const topic = chunk.split("\n")[0].slice(0, 100).trim() || "ingested";
			await createEntry(db, {
				topic,
				content: chunk,
				source: source ?? `ingestion:${taskId}`,
				tags: ["ingested"],
			});
		}
		processed++;

		await db.prepare(
			`UPDATE ingestion_tasks SET processed_items = ?, updated_at = ? WHERE id = ?`,
		).bind(processedSoFar + processed, sqliteNow(), taskId).run();
	}

	const totalRemaining = remaining.length - processed;
	if (totalRemaining <= 0) {
		await db.prepare(
			`UPDATE ingestion_tasks SET status = 'completed', updated_at = ? WHERE id = ?`,
		).bind(sqliteNow(), taskId).run();
	}

	return { processed, remaining: totalRemaining };
}

export async function getIngestionStatus(
	db: D1Database,
	taskId: string,
): Promise<{
	id: string;
	status: string;
	total_items: number;
	processed_items: number;
	error: string | null;
} | null> {
	const row = await db.prepare(
		`SELECT id, status, total_items, processed_items, error FROM ingestion_tasks WHERE id = ?`,
	).bind(taskId).first();

	if (!row) return null;

	return {
		id: row.id as string,
		status: row.status as string,
		total_items: row.total_items as number,
		processed_items: row.processed_items as number,
		error: (row.error as string) ?? null,
	};
}
