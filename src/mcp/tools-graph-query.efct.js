/** @implements FR-008 — Effects-backed graph query MCP tool handler. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-graph-query.efct";
/** Handle "query_graph" tool. */
export async function handleQueryGraph(args, deps) {
	const cursorError = deps.cursor.ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	const result = await deps.queryTriples(args);
	const items = [];
	for (let i = 0; i < result.items.length; i++) {
		items.push(deps.graphPublic.normalizeTriple(result.items[i], deps.normalizeValidToState));
	}
	return deps.formatResult(
		result.items.length > 0 ? "Found " + result.items.length + " triples" : "No triples found",
		{ items, next_cursor: result.next_cursor },
		"knowledge://graph/triples",
	);
}
