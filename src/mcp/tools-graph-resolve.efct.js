/** @implements FR-010 — Effects-backed graph conflict resolution MCP tool handlers. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-graph-resolve.efct";
/** Handle "resolve_conflict" tool — reject strategy. */
export async function handleResolveReject(args, deps) {
	await deps.removeConflict(args.conflict_id);
	return deps.formatResult(
		"Conflict rejected — no changes made",
		{ conflict_id: args.conflict_id, strategy: args.strategy, resolved: true },
		"knowledge://conflicts/" + args.conflict_id,
	);
}
/** Handle "resolve_conflict" tool — replace strategy. */
export async function handleResolveReplace(args, deps) {
	await deps.removeConflict(args.conflict_id);
	const conflict = args.conflict;
	const existing = conflict.existing;
	const incoming = conflict.incoming;
	const updated = await deps.updateTriple(existing.id, {
		object: incoming.object,
		source: incoming.source || undefined,
		actor: incoming.actor || undefined,
		confidence: incoming.confidence || undefined,
	});
	deps.notifyResourceChange("triple");
	deps.logEvent("conflict_resolved", {
		conflict_id: args.conflict_id,
		strategy: args.strategy,
		triple_id: updated.id,
	});
	return deps.formatResult(
		"Replaced triple " + updated.id,
			{
				conflict_id: args.conflict_id,
				strategy: args.strategy,
				triple: deps.graphPublic.normalizeTriple(updated, deps.normalizeValidToState),
				resolved: true,
			},
		"knowledge://graph/triples/" + updated.id,
	);
}
/** Handle "resolve_conflict" tool — retain_both strategy. */
export async function handleResolveRetain(args, deps) {
	await deps.removeConflict(args.conflict_id);
	const conflict = args.conflict;
	const incoming = conflict.incoming;
	const triple = await deps.createTriple({
		subject: incoming.subject,
		predicate: incoming.predicate,
		object: incoming.object,
		source: incoming.source || undefined,
		actor: incoming.actor || undefined,
		confidence: incoming.confidence || undefined,
	});
	deps.notifyResourceChange("triple");
	return deps.formatResult(
		"Retained both — created triple " + triple.id,
			{
				conflict_id: args.conflict_id,
				strategy: args.strategy,
				triple: deps.graphPublic.normalizeTriple(triple, deps.normalizeValidToState),
				resolved: true,
			},
		"knowledge://graph/triples/" + triple.id,
	);
}
