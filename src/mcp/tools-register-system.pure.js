/** @implements FR-019, FR-020 — Register history and ingestion MCP tools. */
import { ensureValidCursor } from "./tools-cursor.pure.js";

export const _MODULE = "tools-register-system.pure";
/** Register system-maintenance tools. */
export function registerSystemTools(server, schemas, deps) {
	const tool = (name, description, schema, handler) => {
		server.tool(name, description, schema, handler);
	};
	tool("undo", "Revert the last N transactions (default: 1)", schemas.undo, (args) =>
		deps.efctUndo(args, {
			undoTransactions: deps.undoTransactions,
			notifyResourceChange: deps.notifyResourceChange,
			formatResult: deps.formatResult,
		}),
	);
		tool("history", "View recent transaction history", schemas.history, (args) =>
			deps.efctHistory(args, {
				cursor: {
					ensureValidCursor,
				},
				std: deps.std,
				getHistory: deps.getHistory,
				formatResult: deps.formatResult,
			}),
	);
	tool(
		"ingest",
		"Ingest text content as knowledge entries (sync for small, async for large)",
		schemas.ingest,
		(args) =>
			deps.efctIngest(args, {
				shouldProcessAsync: deps.shouldProcessAsync,
				ingestAsync: deps.ingestAsync,
				ingestSync: deps.ingestSync,
				notifyResourceChange: deps.notifyResourceChange,
				formatResult: deps.formatResult,
			}),
	);
	tool(
		"ingestion_status",
		"Check status of an async ingestion task",
		schemas.ingestion_status,
		(args) =>
			deps.efctIngestionStatus(args, {
				getIngestionStatus: deps.getIngestionStatus,
				formatResult: deps.formatResult,
				formatError: deps.formatError,
				throwNotFound: deps.throwNotFound,
			}),
	);
}
