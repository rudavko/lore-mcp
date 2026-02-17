// Conflict detection engine (Spec 003-004).
// Advisory only — detects conflicts, does not auto-resolve.

import { ulid } from "../lib/ulid";
import { findActiveTriples } from "../db/triples";
import type { ConflictInfo } from "../lib/types";

export async function detectConflict(
	db: D1Database,
	params: {
		subject: string;
		predicate: string;
		incomingObject: string;
		incomingConfidence?: number | null;
		incomingSource?: string | null;
		incomingActor?: string | null;
	},
): Promise<ConflictInfo | null> {
	const existing = await findActiveTriples(db, params.subject, params.predicate);

	if (existing.length === 0) return null;

	// Check if any existing triple has a different object value
	const conflicting = existing.find((t) => t.object !== params.incomingObject);
	if (!conflicting) return null;

	return {
		conflict_id: ulid(),
		scope: `${params.subject}/${params.predicate}`,
		existing: conflicting,
		incoming: {
			subject: params.subject,
			predicate: params.predicate,
			object: params.incomingObject,
			confidence: params.incomingConfidence,
			source: params.incomingSource,
			actor: params.incomingActor,
		},
		candidate_resolutions: ["replace", "retain_both", "reject"],
	};
}
