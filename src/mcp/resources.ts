// MCP resource handlers with cursor pagination (Spec 002-003, Phase 4.2).
// Each resource supports optional cursor+limit via URI template variables.
// Cursor = base64-encoded last-seen ID. Clients follow next_cursor for paging.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rowToEntry } from "../db/entries";
import { rowToTriple } from "../db/triples";
import { decodeCursor } from "../lib/format";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: string | undefined): number {
	if (!raw) return DEFAULT_LIMIT;
	const n = parseInt(raw, 10);
	return Number.isNaN(n) ? DEFAULT_LIMIT : Math.min(Math.max(n, 1), MAX_LIMIT);
}

export function registerResources(server: McpServer, env: { DB: D1Database }) {
	server.resource(
		"entries",
		new ResourceTemplate("knowledge://entries{?cursor,limit}", { list: undefined }),
		{ description: "Knowledge entries (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit as string);
			const cursorId = decodeCursor(variables.cursor as string);

			const conditions = ["deleted_at IS NULL"];
			const binds: unknown[] = [];

			if (cursorId) {
				conditions.push("id < ?");
				binds.push(cursorId);
			}

			binds.push(limit + 1); // Fetch one extra to detect next page
			const { results } = await env.DB.prepare(
				`SELECT * FROM entries WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT ?`,
			).bind(...binds).all();

			const hasMore = results.length > limit;
			const page = hasMore ? results.slice(0, limit) : results;
			const items = page.map((r) => rowToEntry(r as Record<string, unknown>));
			const nextCursor = hasMore && items.length > 0
				? btoa(items[items.length - 1].id)
				: null;

			return {
				contents: [{
					uri: uri.href,
					mimeType: "application/json",
					text: JSON.stringify({ items, count: items.length, next_cursor: nextCursor }),
				}],
			};
		},
	);

	server.resource(
		"triples",
		new ResourceTemplate("knowledge://graph/triples{?cursor,limit}", { list: undefined }),
		{ description: "Graph triples (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit as string);
			const cursorId = decodeCursor(variables.cursor as string);

			const conditions = ["deleted_at IS NULL"];
			const binds: unknown[] = [];

			if (cursorId) {
				conditions.push("id < ?");
				binds.push(cursorId);
			}

			binds.push(limit + 1);
			const { results } = await env.DB.prepare(
				`SELECT * FROM triples WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT ?`,
			).bind(...binds).all();

			const hasMore = results.length > limit;
			const page = hasMore ? results.slice(0, limit) : results;
			const items = page.map((r) => rowToTriple(r as Record<string, unknown>));
			const nextCursor = hasMore && items.length > 0
				? btoa(items[items.length - 1].id)
				: null;

			return {
				contents: [{
					uri: uri.href,
					mimeType: "application/json",
					text: JSON.stringify({ items, count: items.length, next_cursor: nextCursor }),
				}],
			};
		},
	);

	server.resource(
		"transactions",
		new ResourceTemplate("knowledge://history/transactions{?cursor,limit}", { list: undefined }),
		{ description: "Transaction history (paginated)", mimeType: "application/json" },
		async (uri, variables) => {
			const limit = parseLimit(variables.limit as string);
			const cursorId = decodeCursor(variables.cursor as string);

			const conditions: string[] = [];
			const binds: unknown[] = [];

			if (cursorId) {
				conditions.push("id < ?");
				binds.push(cursorId);
			}

			const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
			binds.push(limit + 1);
			const { results } = await env.DB.prepare(
				`SELECT * FROM transactions ${where} ORDER BY id DESC LIMIT ?`,
			).bind(...binds).all();

			const hasMore = results.length > limit;
			const page = hasMore ? results.slice(0, limit) : results;
			const items = page.map((r) => ({
				id: r.id as string,
				op: r.op,
				entity_type: r.entity_type,
				entity_id: r.entity_id,
				created_at: r.created_at,
			}));
			const nextCursor = hasMore && items.length > 0
				? btoa(items[items.length - 1].id as string)
				: null;

			return {
				contents: [{
					uri: uri.href,
					mimeType: "application/json",
					text: JSON.stringify({ items, count: items.length, next_cursor: nextCursor }),
				}],
			};
		},
	);
}
