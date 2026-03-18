/** @implements NFR-001 — Pure MCP subscription helpers: URI mapping, entity resolution. */
/** Sentinel for TDD hook. */
export const _MODULE = "subscriptions.pure";
export const ENTITY_URI_ENTRIES = "knowledge://entries";
export const ENTITY_URI_TRIPLES = "knowledge://graph/triples";
export const TRANSACTIONS_URI = "knowledge://history/transactions";
/** Resolve an entity type string to its corresponding resource URI. */
export function resolveEntityUri(entityType) {
	if (entityType === "triple") {
		return ENTITY_URI_TRIPLES;
	}
	return ENTITY_URI_ENTRIES;
}
