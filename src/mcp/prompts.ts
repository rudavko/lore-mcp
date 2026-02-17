// MCP prompt templates (Spec 002-005).
// Guides agents through common knowledge operations.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
	server.prompt(
		"ingest-memory",
		"Guide for storing knowledge with provenance metadata",
		async () => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: [
							"You are ingesting knowledge into a persistent store. For each piece of information:",
							"",
							"1. Use the `store` tool with these fields:",
							"   - topic: A short, grep-friendly label (e.g., 'bun-sqlite-quirk', 'react-19-breaking')",
							"   - content: The actual knowledge, written as a factual statement",
							"   - tags: Array of relevant tags for filtering (language, tool, category)",
							"   - source: Where this knowledge came from (URL, doc name, conversation)",
							"   - actor: Who/what provided it (user name, bot name, 'observation')",
							"   - confidence: 0.0-1.0 indicating certainty (1.0 = verified fact, 0.5 = likely true)",
							"",
							"2. For relationships between concepts, use `relate` with subject/predicate/object",
							"3. Use `upsert_entity` to create canonical entities before relating them",
							"4. For large text blocks, use `ingest` which auto-chunks and deduplicates",
						].join("\n"),
					},
				},
			],
		}),
	);

	server.prompt(
		"retrieve-context",
		"Guide for querying knowledge with filters and scoring",
		async () => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: [
							"You are retrieving knowledge from a persistent store. Query strategies:",
							"",
							"1. **Text search**: Use `query` with topic or content for hybrid retrieval",
							"   - Results include score_lexical, score_semantic, score_graph breakdown",
							"   - Use cursor for pagination (don't use offset)",
							"",
							"2. **Tag filtering**: Use `query` with tags array (entries must match ALL tags)",
							"",
							"3. **Graph traversal**: Use `query_graph` to find relationships",
							"   - Filter by subject, predicate, or object (substring match)",
							"   - Combine with entity resolution via `upsert_entity`",
							"",
							"4. **History**: Use `history` to see recent changes, `undo` to revert",
							"",
							"5. **Resources**: Read `knowledge://entries` for bulk access",
							"",
							"Always check provenance (source, actor, confidence) when evaluating results.",
						].join("\n"),
					},
				},
			],
		}),
	);

	server.prompt(
		"correct-stale-facts",
		"Guide for finding and updating outdated knowledge",
		async () => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: [
							"You are auditing and correcting stale knowledge. Follow this workflow:",
							"",
							"1. **Find candidates**: Query entries with low confidence or old dates",
							"   - `query` with relevant topic terms",
							"   - Check `confidence` < 0.5 or old `created_at` dates",
							"",
							"2. **Verify facts**: For each candidate:",
							"   - Check if the information is still accurate",
							"   - Look for conflicting triples via `query_graph`",
							"",
							"3. **Update or delete**:",
							"   - `update` to correct content and bump confidence",
							"   - `delete` for completely wrong entries",
							"   - `resolve_conflict` if competing facts exist",
							"",
							"4. **Track provenance**: When updating, set:",
							"   - source: 'audit' or specific verification source",
							"   - actor: who performed the audit",
							"   - confidence: new confidence level based on verification",
							"",
							"5. **Review**: Use `history` to verify your changes are correct",
						].join("\n"),
					},
				},
			],
		}),
	);
}
