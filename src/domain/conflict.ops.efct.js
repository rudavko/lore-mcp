/** @implements FR-006 — Conflict detection effect operations combining DB reads with pure comparison logic. */
/** Sentinel for TDD hook. */
export const _MODULE = "conflict.efct";
/** Detect a conflict between incoming triple data and existing triples.
 *  Pure logic is inlined (no cross-module value import). */
export async function detectConflict(params, deps) {
	const existing = await deps.findActiveTriples(params.subject, params.predicate);
	if (existing.length === 0) {
		return null;
	}
	const conflicting = deps.findConflictingTriple(existing, params.incomingObject);
	if (conflicting === null) {
		return null;
	}
	return deps.buildConflictInfo(deps.generateId(), conflicting, {
		subject: params.subject,
		predicate: params.predicate,
		object: params.incomingObject,
		confidence: params.incomingConfidence ?? undefined,
		source: params.incomingSource ?? undefined,
		actor: params.incomingActor ?? undefined,
		valid_from: params.incomingValidFrom ?? undefined,
		valid_to: params.incomingValidTo ?? undefined,
	});
}
