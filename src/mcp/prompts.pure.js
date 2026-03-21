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
						"You are ingesting knowledge into a persistent store through exactly four tools: `object_create`, `link_object`, `retrieve`, and `engine_check`.",
						"",
						"Cookbook:",
						"1. Create durable notes with `object_create` kind=`note` and `payload.body`.",
						"   Example: { kind: \"note\", payload: { body: \"Alice prefers short release notes.\" }, source: \"meeting-notes\", confidence: 0.8, tags: [\"prefs\", \"release\"] }",
						"",
						"2. Create canonical entities with `object_create` kind=`entity` and `payload.name`.",
						"   Example: { kind: \"entity\", payload: { name: \"Alice\" }, entity_type: \"person\", source: \"crm\", confidence: 0.95, valid_from: \"2026-03-01T00:00:00Z\" }",
						"",
						"3. Create explicit relationships with `link_object` using subject, predicate, and object.",
						"   Example: { subject: \"entity-alice\", predicate: \"works_on\", object: \"project-lore\", source: \"staffing-sheet\", confidence: 0.9 }",
						"",
						"4. When a fact changes, do not overwrite the old object in place. Create a new object and connect it with `supersedes`.",
						"",
						"5. When something should be treated as deleted, create a new link to `deleted` rather than removing history.",
						"",
						"6. Include provenance and validity whenever known: `source`, `confidence`, `valid_from`, `valid_to`, `tags`, `produced_by`, `about`, `affects`, and `specificity`.",
						"",
						"7. Use `engine_check` for operational visibility such as `help`, `status`, `history`, and `ingest_status`.",
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
						"You are retrieving knowledge from a persistent store through exactly four tools: `object_create`, `link_object`, `retrieve`, and `engine_check`.",
						"",
						"Cookbook:",
						"1. Use `retrieve` for all search flows. It returns notes, entities, and links in one result stream.",
						"   Example: { q: \"Alice release notes\", limit: 10 }",
						"",
						"2. Use `cursor` to paginate and keep scans bounded.",
						"   Example: { q: \"release notes\", limit: 10, cursor: \"<next_cursor>\" }",
						"",
						"3. Use `include_links` when explicit relationship context matters, and `include_auto_links` when implicit canonical associations matter.",
						"   Example: { q: \"Alice\", include_links: true, include_auto_links: true, limit: 5 }",
						"",
						"4. Use `engine_check` action=`history` to inspect recent changes and action=`status` to assess instance health before or after retrieval work.",
						"",
						"5. Always check provenance, validity windows, and whether a newer object `supersedes` an older one.",
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
						"You are auditing and correcting stale knowledge through exactly four tools: `object_create`, `link_object`, `retrieve`, and `engine_check`.",
						"",
						"Cookbook:",
						"1. Find candidates with `retrieve`.",
						"   Example: { q: \"Alice title\", include_links: true, limit: 10 }",
						"",
						"2. Inspect related context with `include_links` and `include_auto_links`.",
						"",
						"3. Do not edit stale knowledge in place. Create a corrected object with `object_create`.",
						"   Example: create a new note or entity carrying the corrected fact and fresh provenance.",
						"",
						"4. Connect the new object to the older one with `link_object` predicate=`supersedes`.",
						"",
						"5. If the older object should be treated as removed, create a link to `deleted` instead of erasing history.",
						"",
						"6. Track provenance with `source`, `confidence`, `valid_from`, and `valid_to`.",
						"",
						"7. Review the resulting audit trail with `engine_check` action=`history`.",
					].join("\n"),
				},
			},
		],
	};
}
