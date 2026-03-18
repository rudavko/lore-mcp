/** @implements NFR-001 — Pure MCP prompt template builders. */
/** Sentinel for TDD hook. */
export const _MODULE = "prompts.pure";
/** Build the ingest-memory prompt template. */
export function buildIngestMemoryPrompt() {
	return {
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text: [
						"You are ingesting knowledge into a persistent store. For each piece of information:",
						"",
						"1. Use the `store` tool with these fields:",
						"   - topic: A short, grep-friendly label",
						"   - content: The actual knowledge, written as a factual statement",
						"   - tags: Array of relevant tags for filtering",
						"   - source: Where this knowledge came from",
						"   - actor: Who/what provided it",
						"   - confidence: 0.0-1.0 indicating certainty",
						"   - valid_from: When the fact starts being true (ISO-8601, set whenever known)",
						"   - valid_to: When it stops being true (ISO-8601); omit if unknown, use 'infinite' only when explicitly indefinite",
						"",
						"2. For relationships between concepts, use `relate` with subject/predicate/object",
						"3. Use `upsert_entity` to create canonical entities before relating them",
						"4. For large text blocks, use `ingest` which auto-chunks and deduplicates",
					].join("\n"),
				},
			},
		],
	};
}
/** Build the retrieve-context prompt template. */
export function buildRetrieveContextPrompt() {
	return {
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text: [
						"You are retrieving knowledge from a persistent store. Query strategies:",
						"",
						"1. Use `query` with topic or content for hybrid retrieval",
						"   - Results include score breakdown by retrieval method",
						"   - Use cursor for pagination",
						"",
						"2. Use `query` with tags array for tag filtering (entries must match ALL tags)",
						"",
						"3. Use `query_graph` to find relationships between entities",
						"   - Filter by subject, predicate, or object",
						"",
						"4. Use `history` to see recent changes, `undo` to revert",
						"",
						"Always check provenance (source, actor, confidence) when evaluating results.",
					].join("\n"),
				},
			},
		],
	};
}
/** Build the correct-stale-facts prompt template. */
export function buildCorrectStaleFactsPrompt() {
	return {
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text: [
						"You are auditing and correcting stale knowledge. Follow this workflow:",
						"",
						"1. Find candidates: query entries with low confidence or old dates",
						"",
						"2. Verify facts: check if information is still accurate,",
						"   look for conflicting triples via `query_graph`",
						"",
						"3. Update or delete:",
						"   - `update` to correct content and bump confidence",
						"   - `delete` for completely wrong entries",
						"   - `resolve_conflict` if competing facts exist",
						"",
						"4. Track provenance: set source to audit origin,",
						"   actor to who performed the audit, confidence to new level",
						"",
						"5. Review: use `history` to verify your changes are correct",
					].join("\n"),
				},
			},
		],
	};
}
