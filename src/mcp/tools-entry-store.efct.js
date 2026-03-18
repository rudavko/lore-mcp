/** @implements FR-002, FR-004 — Effects-backed entry store MCP tool handler. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-entry-store.efct";
/** Handle "store" tool. */
export async function handleStore(args, deps) {
	const ttlResult = deps.entryWrite.normalizeTtlSecondsArg(args, deps.std);
	if (ttlResult.error !== null) {
		throw ttlResult.error;
	}
	const normalizedArgs = ttlResult.args;
	const validityError = deps.validation.validateValidityInterval(
		normalizedArgs,
		deps.isInfiniteValidTo,
		deps.std,
	);
	if (validityError !== null) {
		throw validityError;
	}
	const ttlError = deps.entryWrite.validateTtlSeconds(normalizedArgs, deps.std);
	if (ttlError !== null) {
		throw ttlError;
	}
	await deps.checkPolicy("store", normalizedArgs);
	const entry = await deps.createAndEmbed(normalizedArgs);
	const normalized = deps.entryPublic.normalizeMutationEntry(entry, deps.normalizeValidToState);
	const usedDefaultKnowledgeType =
		args.knowledge_type === undefined && entry.knowledge_type === "observation";
	const usedDefaultMemoryType =
		args.memory_type === undefined && entry.memory_type === "fleeting";
	let defaultsApplied = null;
	if (usedDefaultKnowledgeType || usedDefaultMemoryType) {
		defaultsApplied = {
			knowledge_type: usedDefaultKnowledgeType ? "observation" : null,
			memory_type: usedDefaultMemoryType ? "fleeting" : null,
			set_type_nudge: "Use set_type to classify and retain this entry intentionally.",
		};
	}
	const payload =
		defaultsApplied === null
			? normalized.payload
			: { ...normalized.payload, defaults_applied: defaultsApplied };
	const defaultSuffix =
		defaultsApplied === null ? "" : " (defaults applied: use set_type to classify/retain)";
	deps.notifyResourceChange("entry");
	if (normalized.embeddingSyncFailed) {
		deps.logEvent("mutation", {
			op: "store",
			id: entry.id,
			ok: false,
			partial_failure: "embedding_sync_failed",
		});
		return deps.formatResult(
			"Stored entry " + entry.id + defaultSuffix + " (warning: embedding sync failed)",
			payload,
			"knowledge://entries/" + entry.id,
		);
	}
	deps.logEvent("mutation", { op: "store", id: entry.id, ok: true });
	return deps.formatResult(
		"Stored entry " + entry.id + defaultSuffix,
		payload,
		"knowledge://entries/" + entry.id,
	);
}
