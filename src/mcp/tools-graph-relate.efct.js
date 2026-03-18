/** @implements FR-007 — Effects-backed graph relate/conflict MCP tool handlers. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-graph-relate.efct";
/** Handle "relate" tool — conflict path. */
export async function handleRelateConflict(args, deps) {
	const validityError = deps.validation.validateValidityInterval(
		args,
		deps.isInfiniteValidTo,
		deps.std,
	);
	if (validityError !== null) {
		throw validityError;
	}
	await deps.checkPolicy("relate", args);
	const conflict = args.conflict;
	await deps.saveConflict(conflict);
	deps.logEvent("conflict", { scope: conflict.scope, conflict_id: conflict.conflict_id });
	return deps.formatResult(
		"Conflict detected for " +
			args.subject +
			"/" +
				args.predicate +
				". Use resolve_conflict with conflict_id to proceed.",
			deps.recordPublic.stripValidityFieldsDeep(conflict, deps.normalizeValidToState, deps.std),
			"knowledge://conflicts/" + conflict.conflict_id,
		);
}
/** Handle "relate" tool — no-conflict path. */
export async function handleRelateCreate(args, deps) {
	const validityError = deps.validation.validateValidityInterval(
		args,
		deps.isInfiniteValidTo,
		deps.std,
	);
	if (validityError !== null) {
		throw validityError;
	}
	await deps.checkPolicy("relate", args);
	const triple = await deps.createTriple(args);
	deps.notifyResourceChange("triple");
	deps.logEvent("mutation", { op: "relate", id: triple.id, ok: true });
	return deps.formatResult(
		"Created triple " + triple.id,
		deps.graphPublic.normalizeTriple(triple, deps.normalizeValidToState),
		"knowledge://graph/triples/" + triple.id,
	);
}
