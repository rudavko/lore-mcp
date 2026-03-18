/** @implements FR-004, FR-008, FR-017, NFR-005 — MCP resource registration for paginated graph/history export-style inspection and operational visibility. */
/** Sentinel for TDD hook. */
export const _MODULE = "resources.efct";
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
/** Register MCP resources on the server. All dependencies injected. */
export function registerResources(server, deps) {
	/* --- Entries resource --- */
	server.resource(
		"entries",
		deps.createResourceTemplate("knowledge://entries{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://entries", name: "entries" }],
		})),
		{ description: "Knowledge entries (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit);
			const cursorId = deps.decodeCursor(variables.cursor);
			let sql = "SELECT * FROM entries WHERE deleted_at IS NULL";
			const binds = [];
			if (cursorId !== null) {
				sql = sql + " AND id < ?";
				binds.push(cursorId);
			}
			sql = sql + " ORDER BY id DESC LIMIT ?";
			binds.push(limit + 1);
			const { results } = await deps.dbQuery(sql, binds);
			const hasMore = results.length > limit;
			const page = [];
			const pageLen = hasMore ? limit : results.length;
			for (let i = 0; i < pageLen; i++) {
				page.push(results[i]);
			}
			const items = [];
			for (let i = 0; i < page.length; i++) {
				items.push(deps.rowToEntry(page[i]));
			}
			let nextCursor = null;
			if (hasMore && items.length > 0) {
				const lastItem = page[page.length - 1];
				nextCursor = deps.btoa(lastItem.id);
			}
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: deps.jsonStringify({
							items: items,
							count: items.length,
							next_cursor: nextCursor,
						}),
					},
				],
			};
		},
	);
	/* --- Triples resource --- */
	server.resource(
		"triples",
		deps.createResourceTemplate("knowledge://graph/triples{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://graph/triples", name: "triples" }],
		})),
		{ description: "Graph triples (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit);
			const cursorId = deps.decodeCursor(variables.cursor);
			let sql = "SELECT * FROM triples WHERE deleted_at IS NULL";
			const binds = [];
			if (cursorId !== null) {
				sql = sql + " AND id < ?";
				binds.push(cursorId);
			}
			sql = sql + " ORDER BY id DESC LIMIT ?";
			binds.push(limit + 1);
			const { results } = await deps.dbQuery(sql, binds);
			const hasMore = results.length > limit;
			const page = [];
			const pageLen = hasMore ? limit : results.length;
			for (let i = 0; i < pageLen; i++) {
				page.push(results[i]);
			}
			const items = [];
			for (let i = 0; i < page.length; i++) {
				items.push(deps.rowToTriple(page[i]));
			}
			let nextCursor = null;
			if (hasMore && items.length > 0) {
				const lastItem = page[page.length - 1];
				nextCursor = deps.btoa(lastItem.id);
			}
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: deps.jsonStringify({
							items: items,
							count: items.length,
							next_cursor: nextCursor,
						}),
					},
				],
			};
		},
	);
	/* --- Transactions resource --- */
	server.resource(
		"transactions",
		deps.createResourceTemplate("knowledge://history/transactions{?cursor,limit}", () => ({
			resources: [{ uri: "knowledge://history/transactions", name: "transactions" }],
		})),
		{ description: "Transaction history (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit);
			const cursorId = deps.decodeCursor(variables.cursor);
			let sql = "SELECT * FROM transactions";
			const binds = [];
			if (cursorId !== null) {
				sql = sql + " WHERE id < ?";
				binds.push(cursorId);
			}
			sql = sql + " ORDER BY id DESC LIMIT ?";
			binds.push(limit + 1);
			const { results } = await deps.dbQuery(sql, binds);
			const hasMore = results.length > limit;
			const page = [];
			const pageLen = hasMore ? limit : results.length;
			for (let i = 0; i < pageLen; i++) {
				page.push(results[i]);
			}
			const items = [];
			for (let i = 0; i < page.length; i++) {
				items.push({
					id: page[i].id,
					op: page[i].op,
					entity_type: page[i].entity_type,
					entity_id: page[i].entity_id,
					created_at: page[i].created_at,
				});
			}
			let nextCursor = null;
			if (hasMore && items.length > 0) {
				nextCursor = deps.btoa(items[items.length - 1].id);
			}
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: deps.jsonStringify({
							items: items,
							count: items.length,
							next_cursor: nextCursor,
						}),
					},
				],
			};
		},
	);
}
