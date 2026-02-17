// GEMINI-CONTEXT: Change notification subscriptions (Spec 002-004).
// Uses McpServer.server (the underlying Server instance) to send per-URI
// notifications/resources/updated when data changes.
//
// PROTOCOL LIMITATION: The MCP spec's notifications/resources/updated only
// carries { uri: string }. Spec 002-004 originally called for richer payloads
// (tx_id, change_type, changed_ids), but the protocol doesn't support them.
//
// WORKAROUND — Client workflow for granular change details:
//   1. Subscribe to knowledge://entries, knowledge://graph/triples, and/or
//      knowledge://history/transactions
//   2. Receive notifications/resources/updated with the resource URI
//   3. Read knowledge://history/transactions?limit=1 to get the latest
//      transaction, which includes: id (tx_id), op (change_type),
//      entity_type, entity_id (changed ID), and created_at
//   4. For full before/after snapshots, use the history tool
//
// This provides the same information as the originally-planned rich payload,
// at the cost of one extra resource read per notification.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Map entity types to their resource URIs
const ENTITY_URI_MAP: Record<string, string> = {
	entry: "knowledge://entries",
	triple: "knowledge://graph/triples",
	entity: "knowledge://entries",
	alias: "knowledge://entries",
};

export function registerSubscriptions(server: McpServer) {
	// The MCP SDK handles subscription state internally.
	// Clients call resources/subscribe to opt in, then we emit
	// notifications/resources/updated with the URI when data changes.
}

/** Notify subscribed clients that a specific resource changed.
 *  Sends per-URI notifications/resources/updated via the underlying Server,
 *  plus a transactions-resource notification so clients can read change details. */
export function notifyResourceChange(
	server: McpServer,
	entityType: string,
): void {
	try {
		const uri = ENTITY_URI_MAP[entityType] ?? "knowledge://entries";

		// Per-URI notification for subscribed clients
		server.server.sendResourceUpdated({ uri });

		// Also notify transactions resource (every mutation creates a transaction).
		// Clients subscribe to this URI to get granular change details — after
		// receiving this notification, read with limit=1 for the latest tx.
		server.server.sendResourceUpdated({ uri: "knowledge://history/transactions" });
	} catch {
		// Transport may not support server-initiated messages — silently ignore
	}
}
