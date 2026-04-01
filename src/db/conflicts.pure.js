/** @implements FR-006, NFR-001 — Pure conflict record shaping and TTL helpers. */
export const DEFAULT_CONFLICT_TTL_MS = 60 * 60 * 1000;
/**
 * Validate and narrow an unknown value to ConflictInfo.
 * Returns null if the shape doesn't match.
 */
export function toConflictInfo(raw) {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw;
	if (!candidate.conflict_id || typeof candidate.conflict_id !== "string") return null;
	if (!candidate.scope || typeof candidate.scope !== "string") return null;
	if (!candidate.existing || typeof candidate.existing !== "object") return null;
	if (!candidate.incoming || typeof candidate.incoming !== "object") return null;
	// Check candidate_resolutions is array-like (has numeric length, is not a string)
	const resolutions = candidate.candidate_resolutions;
	if (typeof resolutions !== "object" || resolutions === null) return null;
	if (!("length" in resolutions)) return null;
	return candidate;
}
