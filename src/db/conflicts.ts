import type { ConflictInfo } from "../lib/types";

export const DEFAULT_CONFLICT_TTL_MS = 60 * 60 * 1000;

function toConflictInfo(raw: unknown): ConflictInfo | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<ConflictInfo>;
	if (!candidate.conflict_id || typeof candidate.conflict_id !== "string") return null;
	if (!candidate.scope || typeof candidate.scope !== "string") return null;
	if (!Array.isArray(candidate.candidate_resolutions)) return null;
	if (!candidate.existing || typeof candidate.existing !== "object") return null;
	if (!candidate.incoming || typeof candidate.incoming !== "object") return null;
	return candidate as ConflictInfo;
}

async function sweepExpiredConflicts(db: D1Database, nowMs: number): Promise<void> {
	await db.prepare(`DELETE FROM pending_conflicts WHERE expires_at <= ?`).bind(nowMs).run();
}

export async function savePendingConflict(
	db: D1Database,
	conflict: ConflictInfo,
	ttlMs = DEFAULT_CONFLICT_TTL_MS,
): Promise<void> {
	const nowMs = Date.now();
	const expiresAt = nowMs + ttlMs;

	await db.batch([
		db.prepare(`DELETE FROM pending_conflicts WHERE expires_at <= ?`).bind(nowMs),
		db
			.prepare(
				`INSERT OR REPLACE INTO pending_conflicts (id, payload, expires_at) VALUES (?, ?, ?)`,
			)
			.bind(conflict.conflict_id, JSON.stringify(conflict), expiresAt),
	]);
}

export async function loadPendingConflict(
	db: D1Database,
	id: string,
): Promise<ConflictInfo | null> {
	const nowMs = Date.now();
	await sweepExpiredConflicts(db, nowMs);

	const row = await db
		.prepare(`SELECT payload FROM pending_conflicts WHERE id = ? AND expires_at > ? LIMIT 1`)
		.bind(id, nowMs)
		.first();
	if (!row) return null;

	const payload = (row as Record<string, unknown>).payload;
	if (typeof payload !== "string") {
		await removePendingConflict(db, id);
		return null;
	}

	try {
		const parsed = JSON.parse(payload);
		const conflict = toConflictInfo(parsed);
		if (!conflict) {
			await removePendingConflict(db, id);
		}
		return conflict;
	} catch {
		await removePendingConflict(db, id);
		return null;
	}
}

export async function removePendingConflict(db: D1Database, id: string): Promise<void> {
	await db.prepare(`DELETE FROM pending_conflicts WHERE id = ?`).bind(id).run();
}
