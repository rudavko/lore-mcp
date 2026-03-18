/** @implements FR-004 — Effects-backed entry update MCP tool handler. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-entry-update.efct";
/** Handle "update" tool. */
export async function handleUpdate(args, deps) {
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
	const patchError = deps.entryWrite.ensureEntryUpdatePatch(normalizedArgs);
	if (patchError !== null) {
		throw patchError;
	}
	await deps.checkPolicy("update", normalizedArgs);
	const entry = await deps.updateAndEmbed(normalizedArgs.id, normalizedArgs);
	const normalized = deps.entryPublic.normalizeMutationEntry(entry, deps.normalizeValidToState);
	deps.notifyResourceChange("entry");
	if (normalized.embeddingSyncFailed) {
		deps.logEvent("mutation", {
			op: "update",
			id: entry.id,
			ok: false,
			partial_failure: "embedding_sync_failed",
		});
		return deps.formatResult(
			"Updated entry " + entry.id + " (warning: embedding sync failed)",
			normalized.payload,
			"knowledge://entries/" + entry.id,
		);
	}
	deps.logEvent("mutation", { op: "update", id: entry.id, ok: true });
	return deps.formatResult(
		"Updated entry " + entry.id,
		normalized.payload,
		"knowledge://entries/" + entry.id,
	);
}
