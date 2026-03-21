/** @implements FR-006 — Pure conflict detection helpers: compare existing triples and build conflict payloads. */
/** Sentinel for TDD hook. */
export const _MODULE = "conflict.pure";
/** Find the first existing triple whose object differs from the incoming value.
 *  Returns null if no conflict found. */
export function findConflictingTriple(existing, incomingObject) {
	for (let i = 0; i < existing.length; i++) {
		if (existing[i].object !== incomingObject) {
			return existing[i];
		}
	}
	return null;
}
/** Build a ConflictInfo object from a conflicting triple and incoming parameters. */
export function buildConflictInfo(conflictId, existing, incoming) {
	return {
		conflict_id: conflictId,
		scope: incoming.subject + "/" + incoming.predicate,
		existing: existing,
		incoming: {
			subject: incoming.subject,
			predicate: incoming.predicate,
			object: incoming.object,
			confidence: incoming.confidence,
			source: incoming.source,
			actor: incoming.actor,
			valid_from: incoming.valid_from,
			valid_to: incoming.valid_to,
		},
		candidate_resolutions: ["replace", "retain_both", "reject"],
	};
}
