// Entry CRUD operations with provenance support.

import { ulid, sqliteNow } from "../lib/ulid";
import { KnowledgeError } from "../lib/errors";
import { escapeLike } from "../lib/format";
import type { Entry } from "../lib/types";

const MAX_TOPIC_LENGTH = 1000;
const MAX_CONTENT_LENGTH = 100_000;

export interface CreateEntryParams {
	topic: string;
	content: string;
	tags?: string[];
	source?: string;
	actor?: string;
	confidence?: number;
}

export interface UpdateEntryParams {
	topic?: string;
	content?: string;
	tags?: string[];
	source?: string;
	actor?: string;
	confidence?: number;
}

export interface QueryEntryParams {
	topic?: string;
	tags?: string[];
	content?: string;
	limit?: number;
}

export function rowToEntry(r: Record<string, unknown>): Entry {
	return {
		id: r.id as string,
		topic: r.topic as string,
		content: r.content as string,
		tags: JSON.parse(r.tags as string),
		source: (r.source as string) ?? null,
		actor: (r.actor as string) ?? null,
		confidence: (r.confidence as number) ?? null,
		valid_from: (r.valid_from as string) ?? null,
		valid_to: (r.valid_to as string) ?? null,
		status: (r.status as string) ?? "active",
		canonical_entity_id: (r.canonical_entity_id as string) ?? null,
		created_at: r.created_at as string,
		updated_at: r.updated_at as string,
	};
}

export async function createEntry(
	db: D1Database,
	params: CreateEntryParams,
): Promise<Entry> {
	if (params.topic.length > MAX_TOPIC_LENGTH)
		throw KnowledgeError.validation(`Topic exceeds ${MAX_TOPIC_LENGTH} characters`);
	if (params.content.length > MAX_CONTENT_LENGTH)
		throw KnowledgeError.validation(`Content exceeds ${MAX_CONTENT_LENGTH} characters`);

	const id = ulid();
	const tags = params.tags ?? [];
	const tagsJson = JSON.stringify(tags);
	const now = sqliteNow();

	const entry: Entry = {
		id,
		topic: params.topic,
		content: params.content,
		tags,
		source: params.source ?? null,
		actor: params.actor ?? null,
		confidence: params.confidence ?? null,
		valid_from: null,
		valid_to: null,
		status: "active",
		canonical_entity_id: null,
		created_at: now,
		updated_at: now,
	};

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'entry', ?, NULL, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(entry), now),
		db.prepare(
			`INSERT INTO entries (id, topic, content, tags, source, actor, confidence, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		).bind(id, params.topic, params.content, tagsJson, params.source ?? null, params.actor ?? null, params.confidence ?? null, now, now),
	]);

	return entry;
}

export async function updateEntry(
	db: D1Database,
	id: string,
	params: UpdateEntryParams,
): Promise<Entry> {
	const row = await db.prepare(
		`SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`,
	).bind(id).first();

	if (!row) throw KnowledgeError.notFound("Entry", id);

	const before = rowToEntry(row as Record<string, unknown>);
	const now = sqliteNow();

	const updated: Entry = {
		...before,
		topic: params.topic ?? before.topic,
		content: params.content ?? before.content,
		tags: params.tags ?? before.tags,
		source: params.source !== undefined ? (params.source ?? null) : before.source,
		actor: params.actor !== undefined ? (params.actor ?? null) : before.actor,
		confidence: params.confidence !== undefined ? (params.confidence ?? null) : before.confidence,
		updated_at: now,
	};

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'UPDATE', 'entry', ?, ?, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(before), JSON.stringify(updated), now),
		db.prepare(
			`UPDATE entries SET topic = ?, content = ?, tags = ?, source = ?, actor = ?, confidence = ?, updated_at = ? WHERE id = ?`,
		).bind(updated.topic, updated.content, JSON.stringify(updated.tags), updated.source, updated.actor, updated.confidence, now, id),
	]);

	return updated;
}

export async function deleteEntry(db: D1Database, id: string): Promise<void> {
	const row = await db.prepare(
		`SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`,
	).bind(id).first();

	if (!row) throw KnowledgeError.notFound("Entry", id);

	const before = rowToEntry(row as Record<string, unknown>);
	const now = sqliteNow();

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'DELETE', 'entry', ?, ?, NULL, ?)`,
		).bind(ulid(), id, JSON.stringify(before), now),
		db.prepare(
			`UPDATE entries SET deleted_at = ? WHERE id = ?`,
		).bind(now, id),
	]);
}

// When tags are specified, filtering happens in JS after fetch, so SQL LIMIT
// is only applied when there's no tag filter. Final result is always sliced.
export async function queryEntries(
	db: D1Database,
	params: QueryEntryParams,
): Promise<Entry[]> {
	const limit = Math.min(params.limit ?? 50, 200);
	const hasTags = params.tags && params.tags.length > 0;
	const conditions: string[] = ["deleted_at IS NULL"];
	const binds: unknown[] = [];

	if (params.topic) {
		conditions.push("topic LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.topic)}%`);
	}
	if (params.content) {
		conditions.push("content LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.content)}%`);
	}

	let sql = `SELECT * FROM entries WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
	if (!hasTags) {
		sql += " LIMIT ?";
		binds.push(limit);
	}
	const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
	const { results } = await stmt.all();

	let entries: Entry[] = results.map((r) => rowToEntry(r as Record<string, unknown>));

	if (hasTags) {
		entries = entries.filter((e) =>
			params.tags!.every((t) => e.tags.includes(t)),
		);
	}

	return entries.slice(0, limit);
}
