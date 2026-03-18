/** @implements FR-003 — Effects-backed plain entry query MCP tool handler. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-entry-query-plain.efct";
/** Handle "query" tool — plain listing path. */
export async function handleQueryPlain(args, deps) {
	const cursorError = deps.cursor.ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	const { asOfMs, error } = deps.validation.parseOptionalAsOf(args.as_of, deps.std);
	if (error !== null) {
		throw error;
	}
	const startedAt = deps.std.Date.now();
	const result = await deps.queryEntries(args);
	const recordItems = [];
	for (let i = 0; i < result.items.length; i++) {
		const asRec = deps.recordPublic.asRecord(result.items[i]);
		if (asRec !== null) {
			recordItems.push(asRec);
		}
	}
	const temporalFilteredItems = deps.validation.filterItemsByAsOf(recordItems, asOfMs, deps.std);
	const items = [];
	for (let i = 0; i < temporalFilteredItems.length; i++) {
		items.push(deps.entryPublic.normalizeQueryEntry(temporalFilteredItems[i], deps.normalizeValidToState));
	}
	const retrievalMs = deps.std.Date.now() - startedAt;
	const nextCursor = items.length > 0 ? result.next_cursor : null;
	return deps.formatResult(
		items.length > 0 ? "Found " + items.length + " entries" : "No entries found",
		{ items, next_cursor: nextCursor, retrieval_ms: retrievalMs },
		"knowledge://entries",
	);
}
