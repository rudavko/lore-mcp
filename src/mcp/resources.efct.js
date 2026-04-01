/** @implements FR-004, FR-008, FR-017, NFR-005 — MCP resource registration for paginated graph/history export-style inspection and operational visibility. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
function parseLimit(raw) {
	if (raw === undefined || raw === null || raw === "") {
		return DEFAULT_LIMIT;
	}
	let n = 0;
	let valid = false;
	for (let i = 0; i < raw.length; i++) {
		const code = raw.charCodeAt(i);
		if (code >= 48 && code <= 57) {
			n = n * 10 + (code - 48);
			valid = true;
		} else {
			return DEFAULT_LIMIT;
		}
	}
	if (!valid) {
		return DEFAULT_LIMIT;
	}
	if (n < 1) {
		return 1;
	}
	if (n > MAX_LIMIT) {
		return MAX_LIMIT;
	}
	return n;
}
function buildPaginatedItems(results, limit, mapItem) {
	const hasMore = results.length > limit;
	const page = [];
	const pageLen = hasMore ? limit : results.length;
	for (let i = 0; i < pageLen; i++) {
		page.push(results[i]);
	}
	const items = [];
	for (let i = 0; i < page.length; i++) {
		items.push(mapItem(page[i]));
	}
	return { hasMore, items };
}
function buildPaginatedResource(uri, variables, deps, config) {
	return async () => {
		const limit = parseLimit(variables.limit);
		const cursorId = deps.decodeCursor(variables.cursor);
		const query = config.buildQuery(cursorId, limit + 1);
		const { results } = await deps.dbQuery(query.sql, query.binds);
		const page = buildPaginatedItems(results, limit, config.mapItem);
		const nextCursor =
			page.hasMore && page.items.length > 0 ? deps.btoa(page.items[page.items.length - 1].id) : null;
		return {
			contents: [
				{
					uri: uri.href,
					mimeType: "application/json",
					text: deps.jsonStringify({
						items: page.items,
						count: page.items.length,
						next_cursor: nextCursor,
					}),
				},
			],
		};
	};
}
/** Register MCP resources on the server. All dependencies injected. */
export function registerResources(server, deps) {
	/* --- Entries resource --- */
	server.resource(
		"entries",
		deps.createResourceTemplate("knowledge://entries{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://entries", name: "entries" }],
		})),
		{ description: "Knowledge entries (paginated)", mimeType: "application/json" },
		(uri, variables) =>
			buildPaginatedResource(uri, variables, deps, {
				buildQuery: (cursorId, limitPlusOne) => {
					let sql = "SELECT * FROM entries WHERE deleted_at IS NULL";
					const binds = [];
					if (cursorId !== null) {
						sql = sql + " AND id < ?";
						binds.push(cursorId);
					}
					sql = sql + " ORDER BY id DESC LIMIT ?";
					binds.push(limitPlusOne);
					return { sql, binds };
				},
				mapItem: (row) => deps.rowToEntry(row),
			})(),
	);
	/* --- Triples resource --- */
	server.resource(
		"triples",
		deps.createResourceTemplate("knowledge://graph/triples{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://graph/triples", name: "triples" }],
		})),
		{ description: "Graph triples (paginated)", mimeType: "application/json" },
		(uri, variables) =>
			buildPaginatedResource(uri, variables, deps, {
				buildQuery: (cursorId, limitPlusOne) => {
					let sql = "SELECT * FROM triples WHERE deleted_at IS NULL";
					const binds = [];
					if (cursorId !== null) {
						sql = sql + " AND id < ?";
						binds.push(cursorId);
					}
					sql = sql + " ORDER BY id DESC LIMIT ?";
					binds.push(limitPlusOne);
					return { sql, binds };
				},
				mapItem: (row) => deps.rowToTriple(row),
			})(),
	);
	/* --- Transactions resource --- */
	server.resource(
		"transactions",
		deps.createResourceTemplate("knowledge://history/transactions{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://history/transactions", name: "transactions" }],
		})),
		{ description: "Transaction history (paginated)", mimeType: "application/json" },
		(uri, variables) =>
			buildPaginatedResource(uri, variables, deps, {
				buildQuery: (cursorId, limitPlusOne) => {
					let sql = "SELECT * FROM transactions";
					const binds = [];
					if (cursorId !== null) {
						sql = sql + " WHERE id < ?";
						binds.push(cursorId);
					}
					sql = sql + " ORDER BY id DESC LIMIT ?";
					binds.push(limitPlusOne);
					return { sql, binds };
				},
				mapItem: (row) => ({
					id: row.id,
					op: row.op,
					entity_type: row.entity_type,
					entity_id: row.entity_id,
					created_at: row.created_at,
				}),
			})(),
	);
}
