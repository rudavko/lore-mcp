/** @implements FR-003 — Effects-backed hybrid entry query MCP tool handler. */
function filterHybridQueryItems(items, args, asOfMs, deps) {
	const strictFilteredItems = [];
	if (args.strict_substring === true) {
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const topicMatches =
				typeof args.topic !== "string" ||
				args.topic.length === 0 ||
				(typeof item.topic === "string" &&
					item.topic.toLowerCase().indexOf(args.topic.toLowerCase()) >= 0);
			if (!topicMatches) {
				continue;
			}
			const contentMatches =
				typeof args.content !== "string" ||
				args.content.length === 0 ||
				(typeof item.content === "string" &&
					item.content.toLowerCase().indexOf(args.content.toLowerCase()) >= 0);
			if (contentMatches) {
				strictFilteredItems.push(item);
			}
		}
		} else {
			for (let i = 0; i < items.length; i++) {
				strictFilteredItems.push(items[i]);
			}
		}
	const temporalFilteredItems = deps.validation.filterItemsByAsOf(strictFilteredItems, asOfMs, deps.std);
	return deps.filterByTags(temporalFilteredItems, args.tags);
}
/** Handle "query" tool — hybrid search path. */
export async function handleQueryHybrid(args, deps) {
	const cursorError = deps.cursor.ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	const { asOfMs, error } = deps.validation.parseOptionalAsOf(args.as_of, deps.std);
	if (error !== null) {
		throw error;
	}
	const startedAt = deps.std.Date.now();
	const result = await deps.hybridSearch({
		query: deps.queryText,
		limit: args.limit,
		cursor: args.cursor,
		knowledge_type: args.knowledge_type,
		memory_type: args.memory_type,
	});
	const filteredItems = filterHybridQueryItems(result.items, args, asOfMs, deps);
	const items = [];
	for (let i = 0; i < filteredItems.length; i++) {
		items.push(deps.entryPublic.normalizeQueryEntry(filteredItems[i], deps.normalizeValidToState));
	}
	deps.logEvent("retrieval", { mode: "hybrid", results: items.length, ms: result.retrieval_ms });
	const retrievalMs =
		result.retrieval_ms >= 0 ? result.retrieval_ms : deps.std.Date.now() - startedAt;
	const nextCursor = items.length > 0 ? result.next_cursor : null;
	const message =
		items.length > 0
			? "Found " + items.length + " entries (" + retrievalMs + "ms)"
			: "No entries found (" + retrievalMs + "ms)";
	return deps.formatResult(
		message,
		{ items, next_cursor: nextCursor, retrieval_ms: retrievalMs },
		"knowledge://entries",
	);
}
