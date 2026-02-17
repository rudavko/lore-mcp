// Triple CRUD operations with provenance support.

import { ulid, sqliteNow } from "../lib/ulid";
import { KnowledgeError } from "../lib/errors";
import { escapeLike } from "../lib/format";
import type { Triple } from "../lib/types";

const MAX_FIELD_LENGTH = 2000;

export interface CreateTripleParams {
	subject: string;
	predicate: string;
	object: string;
	source?: string;
	actor?: string;
	confidence?: number;
}

export interface UpdateTripleParams {
	predicate?: string;
	object?: string;
	source?: string;
	actor?: string;
	confidence?: number;
}

export interface QueryTripleParams {
	subject?: string;
	predicate?: string;
	object?: string;
	limit?: number;
}

export function rowToTriple(r: Record<string, unknown>): Triple {
	return {
		id: r.id as string,
		subject: r.subject as string,
		predicate: r.predicate as string,
		object: r.object as string,
		source: (r.source as string) ?? null,
		actor: (r.actor as string) ?? null,
		confidence: (r.confidence as number) ?? null,
		valid_from: (r.valid_from as string) ?? null,
		valid_to: (r.valid_to as string) ?? null,
		status: (r.status as string) ?? "active",
		created_at: r.created_at as string,
	};
}

export async function createTriple(
	db: D1Database,
	params: CreateTripleParams,
): Promise<Triple> {
	if (params.subject.length > MAX_FIELD_LENGTH)
		throw KnowledgeError.validation(`Subject exceeds ${MAX_FIELD_LENGTH} characters`);
	if (params.predicate.length > MAX_FIELD_LENGTH)
		throw KnowledgeError.validation(`Predicate exceeds ${MAX_FIELD_LENGTH} characters`);
	if (params.object.length > MAX_FIELD_LENGTH)
		throw KnowledgeError.validation(`Object exceeds ${MAX_FIELD_LENGTH} characters`);

	const id = ulid();
	const now = sqliteNow();

	const triple: Triple = {
		id,
		subject: params.subject,
		predicate: params.predicate,
		object: params.object,
		source: params.source ?? null,
		actor: params.actor ?? null,
		confidence: params.confidence ?? null,
		valid_from: null,
		valid_to: null,
		status: "active",
		created_at: now,
	};

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'CREATE', 'triple', ?, NULL, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(triple), now),
		db.prepare(
			`INSERT INTO triples (id, subject, predicate, object, source, actor, confidence, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
		).bind(id, params.subject, params.predicate, params.object, params.source ?? null, params.actor ?? null, params.confidence ?? null, now),
	]);

	return triple;
}

export async function updateTriple(
	db: D1Database,
	id: string,
	params: UpdateTripleParams,
): Promise<Triple> {
	const row = await db.prepare(
		`SELECT * FROM triples WHERE id = ? AND deleted_at IS NULL`,
	).bind(id).first();

	if (!row) throw KnowledgeError.notFound("Triple", id);

	const before = rowToTriple(row as Record<string, unknown>);
	const now = sqliteNow();

	const updated: Triple = {
		...before,
		predicate: params.predicate ?? before.predicate,
		object: params.object ?? before.object,
		source: params.source !== undefined ? (params.source ?? null) : before.source,
		actor: params.actor !== undefined ? (params.actor ?? null) : before.actor,
		confidence: params.confidence !== undefined ? (params.confidence ?? null) : before.confidence,
	};

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'UPDATE', 'triple', ?, ?, ?, ?)`,
		).bind(ulid(), id, JSON.stringify(before), JSON.stringify(updated), now),
		db.prepare(
			`UPDATE triples SET predicate = ?, object = ?, source = ?, actor = ?, confidence = ? WHERE id = ?`,
		).bind(updated.predicate, updated.object, updated.source, updated.actor, updated.confidence, id),
	]);

	return updated;
}

export async function upsertTriple(
	db: D1Database,
	params: CreateTripleParams,
): Promise<{ triple: Triple; created: boolean }> {
	// Find existing active triple with same subject+predicate
	const row = await db.prepare(
		`SELECT * FROM triples WHERE subject = ? AND predicate = ? AND deleted_at IS NULL LIMIT 1`,
	).bind(params.subject, params.predicate).first();

	if (row) {
		const existing = rowToTriple(row as Record<string, unknown>);
		const updated = await updateTriple(db, existing.id, {
			object: params.object,
			source: params.source,
			actor: params.actor,
			confidence: params.confidence,
		});
		return { triple: updated, created: false };
	}

	const triple = await createTriple(db, params);
	return { triple, created: true };
}

export async function deleteTriple(db: D1Database, id: string): Promise<void> {
	const row = await db.prepare(
		`SELECT * FROM triples WHERE id = ? AND deleted_at IS NULL`,
	).bind(id).first();

	if (!row) throw KnowledgeError.notFound("Triple", id);

	const before = rowToTriple(row as Record<string, unknown>);
	const now = sqliteNow();

	await db.batch([
		db.prepare(
			`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, 'DELETE', 'triple', ?, ?, NULL, ?)`,
		).bind(ulid(), id, JSON.stringify(before), now),
		db.prepare(
			`UPDATE triples SET deleted_at = ? WHERE id = ?`,
		).bind(now, id),
	]);
}

export async function queryTriples(
	db: D1Database,
	params: QueryTripleParams,
): Promise<Triple[]> {
	const limit = Math.min(params.limit ?? 50, 200);
	const conditions: string[] = ["deleted_at IS NULL"];
	const binds: unknown[] = [];

	if (params.subject) {
		conditions.push("subject LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.subject)}%`);
	}
	if (params.predicate) {
		conditions.push("predicate LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.predicate)}%`);
	}
	if (params.object) {
		conditions.push("object LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.object)}%`);
	}

	binds.push(limit);
	const sql = `SELECT * FROM triples WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
	const stmt = db.prepare(sql).bind(...binds);
	const { results } = await stmt.all();

	return results.map((r) => rowToTriple(r as Record<string, unknown>));
}

// Find active triples matching subject+predicate (for conflict detection)
export async function findActiveTriples(
	db: D1Database,
	subject: string,
	predicate: string,
): Promise<Triple[]> {
	const { results } = await db.prepare(
		`SELECT * FROM triples WHERE subject = ? AND predicate = ? AND deleted_at IS NULL`,
	).bind(subject, predicate).all();

	return results.map((r) => rowToTriple(r as Record<string, unknown>));
}
