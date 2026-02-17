// GEMINI-CONTEXT: All MCP tool registrations. This is the central wiring file
// that registers all tools on the McpServer. Conflict resolution carries full
// provenance (source/actor/confidence) from the original relate call through
// the ConflictInfo and into the resolution handlers.
//
// GEMINI-CONTEXT: Conflicts are stored in DO storage (DurableObjectStorage)
// so they survive Durable Object hibernation between relate → resolve_conflict.
// Each conflict has a 1-hour TTL; expired conflicts are cleaned up on read.
// Falls back to an in-memory Map when no storage is provided (e.g. in tests).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatResult, formatError } from "../lib/format";
import { KnowledgeError } from "../lib/errors";
import { checkPolicy } from "../domain/policy";
import { detectConflict } from "../domain/conflict";
import { createEntry, updateEntry, deleteEntry, queryEntries } from "../db/entries";
import { createTriple, updateTriple, upsertTriple, deleteTriple, queryTriples } from "../db/triples";
import { upsertEntity, mergeEntities } from "../db/entities";
import { undoTransactions, getHistory } from "../db/history";
import { hybridSearch, syncEmbedding } from "../db/search";
import {
	shouldProcessAsync,
	ingestSync,
	ingestAsync,
	getIngestionStatus,
} from "../domain/ingestion";
import { notifyResourceChange } from "./subscriptions";
import type { ConflictInfo } from "../lib/types";
import { logEvent } from "../lib/observe";

const CONFLICT_TTL_MS = 60 * 60 * 1000;
const CONFLICT_KEY_PREFIX = "conflict:";

interface StoredConflict {
	conflict: ConflictInfo;
	storedAt: number;
}

export function registerTools(
	server: McpServer,
	env: { DB: D1Database; AI?: Ai; VECTORIZE_INDEX?: VectorizeIndex },
	storage?: DurableObjectStorage,
) {
	// Conflict helpers — use DO storage when available, in-memory Map as fallback.
	const fallbackMap = new Map<string, ConflictInfo>();

	async function saveConflict(conflict: ConflictInfo): Promise<void> {
		if (storage) {
			const stored: StoredConflict = { conflict, storedAt: Date.now() };
			await storage.put(`${CONFLICT_KEY_PREFIX}${conflict.conflict_id}`, stored);
		} else {
			if (fallbackMap.size >= 100) {
				const oldest = fallbackMap.keys().next().value;
				if (oldest) fallbackMap.delete(oldest);
			}
			fallbackMap.set(conflict.conflict_id, conflict);
		}
	}

	async function loadConflict(id: string): Promise<ConflictInfo | null> {
		if (storage) {
			const stored = await storage.get<StoredConflict>(`${CONFLICT_KEY_PREFIX}${id}`);
			if (!stored) return null;
			if (Date.now() - stored.storedAt > CONFLICT_TTL_MS) {
				await storage.delete(`${CONFLICT_KEY_PREFIX}${id}`);
				return null;
			}
			return stored.conflict;
		}
		return fallbackMap.get(id) ?? null;
	}

	async function removeConflict(id: string): Promise<void> {
		if (storage) {
			await storage.delete(`${CONFLICT_KEY_PREFIX}${id}`);
		} else {
			fallbackMap.delete(id);
		}
	}

	/** Notify subscribed clients after a mutation. Non-fatal. */
	const notify = (entityType: string) => notifyResourceChange(server, entityType);
	// --- Time tool ---

	server.tool(
		"time",
		"Returns the current time in a given timezone",
		{ timezone: z.string().optional().describe("IANA timezone, e.g. Europe/Kyiv. Defaults to UTC.") },
		async ({ timezone }) => {
			const tz = timezone || "UTC";
			try {
				const formatted = new Date().toLocaleString("en-US", {
					timeZone: tz,
					dateStyle: "full",
					timeStyle: "long",
				});
				return formatResult(`${formatted} (${tz})`);
			} catch {
				return formatError(KnowledgeError.validation(`Invalid timezone: "${tz}". Use IANA format.`));
			}
		},
	);

	// --- Knowledge entry tools ---

	server.tool(
		"store",
		"Create a knowledge entry",
		{
			topic: z.string().describe("Short topic/subject label"),
			content: z.string().describe("The knowledge content"),
			tags: z.array(z.string()).optional().describe("Tags for filtering"),
			source: z.string().optional().describe("Provenance source identifier"),
			actor: z.string().optional().describe("Who/what created this"),
			confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
		},
		async ({ topic, content, tags, source, actor, confidence }) => {
			try {
				checkPolicy("store", { topic, content, confidence });
				const entry = await createEntry(env.DB, { topic, content, tags, source, actor, confidence });
				await syncEmbedding(env.AI, env.VECTORIZE_INDEX, entry.id, `${entry.topic} ${entry.content}`);
				notify("entry");
				logEvent("mutation", { op: "store", id: entry.id, ok: true });
				return formatResult(
					`Stored entry ${entry.id}`,
					entry,
					`knowledge://entries/${entry.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"update",
		"Update an existing knowledge entry",
		{
			id: z.string().describe("Entry ID"),
			topic: z.string().optional().describe("New topic"),
			content: z.string().optional().describe("New content"),
			tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
			source: z.string().optional().describe("Provenance source"),
			actor: z.string().optional().describe("Who/what updated this"),
			confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
		},
		async ({ id, topic, content, tags, source, actor, confidence }) => {
			try {
				const entry = await updateEntry(env.DB, id, { topic, content, tags, source, actor, confidence });
				await syncEmbedding(env.AI, env.VECTORIZE_INDEX, entry.id, `${entry.topic} ${entry.content}`);
				notify("entry");
				logEvent("mutation", { op: "update", id: entry.id, ok: true });
				return formatResult(
					`Updated entry ${entry.id}`,
					entry,
					`knowledge://entries/${entry.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"query",
		"Search knowledge entries with hybrid retrieval (lexical + semantic + graph)",
		{
			topic: z.string().optional().describe("Filter by topic (substring)"),
			tags: z.array(z.string()).optional().describe("Filter by tags (entry must have all)"),
			content: z.string().optional().describe("Filter by content (substring)"),
			limit: z.number().int().min(1).max(200).optional().describe("Max entries to return (default: 20)"),
			cursor: z.string().optional().describe("Pagination cursor from previous response"),
		},
		async ({ topic, tags, content, limit, cursor }) => {
			try {
				// If a free-text query is provided, use hybrid search
				const queryText = topic || content;
				if (queryText) {
					const result = await hybridSearch(env.DB, env.AI, env.VECTORIZE_INDEX, {
						query: queryText,
						limit,
						cursor,
					});

					// Post-filter by tags if specified
					let items = result.items;
					if (tags && tags.length > 0) {
						items = items.filter((e) => tags.every((t) => e.tags.includes(t)));
					}

					logEvent("retrieval", { mode: "hybrid", results: items.length, ms: result.retrieval_ms });
					return formatResult(
						`Found ${items.length} entries (${result.retrieval_ms}ms)`,
						{ items, next_cursor: result.next_cursor, retrieval_ms: result.retrieval_ms },
						"knowledge://entries",
					);
				}

				// Fallback to basic query for tag-only or empty queries
				const entries = await queryEntries(env.DB, { topic, tags, content, limit });
				return formatResult(
					entries.length ? `Found ${entries.length} entries` : "No entries found",
					{ items: entries, next_cursor: null },
					"knowledge://entries",
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"delete",
		"Soft-delete an entry or triple",
		{
			id: z.string().describe("Entity ID"),
			entity_type: z.enum(["entry", "triple"]).optional().describe("Type of entity (default: entry)"),
		},
		async ({ id, entity_type }) => {
			try {
				const type = entity_type ?? "entry";
				if (type === "entry") {
					await deleteEntry(env.DB, id);
				} else {
					await deleteTriple(env.DB, id);
				}
				notify(type);
				logEvent("mutation", { op: "delete", entity_type: type, id, ok: true });
				return formatResult(
					`Deleted ${type} ${id}`,
					{ id, entity_type: type, deleted: true },
					`knowledge://${type === "entry" ? "entries" : "graph/triples"}/${id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	// --- Graph triple tools ---

	server.tool(
		"relate",
		"Create a graph triple (subject-predicate-object relationship)",
		{
			subject: z.string().describe("Subject of the relationship"),
			predicate: z.string().describe("Predicate/verb of the relationship"),
			object: z.string().describe("Object of the relationship"),
			source: z.string().optional().describe("Provenance source"),
			actor: z.string().optional().describe("Who/what created this"),
			confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
		},
		async ({ subject, predicate, object, source, actor, confidence }) => {
			try {
				checkPolicy("relate", { subject, predicate, object, confidence });

				// Conflict detection
				const conflict = await detectConflict(env.DB, {
					subject,
					predicate,
					incomingObject: object,
					incomingConfidence: confidence,
					incomingSource: source,
					incomingActor: actor,
				});

				if (conflict) {
					await saveConflict(conflict);
					logEvent("conflict", { scope: conflict.scope, conflict_id: conflict.conflict_id });
					return formatResult(
						`Conflict detected for ${subject}/${predicate}. Use resolve_conflict with conflict_id to proceed.`,
						conflict,
						`knowledge://conflicts/${conflict.conflict_id}`,
					);
				}

				const triple = await createTriple(env.DB, { subject, predicate, object, source, actor, confidence });
				notify("triple");
				logEvent("mutation", { op: "relate", id: triple.id, ok: true });
				return formatResult(
					`Created triple ${triple.id}`,
					triple,
					`knowledge://graph/triples/${triple.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"query_graph",
		"Query graph triples (all filters AND'd, substring match)",
		{
			subject: z.string().optional().describe("Filter by subject (substring)"),
			predicate: z.string().optional().describe("Filter by predicate (substring)"),
			object: z.string().optional().describe("Filter by object (substring)"),
			limit: z.number().int().min(1).max(200).optional().describe("Max triples to return (default: 50)"),
		},
		async ({ subject, predicate, object, limit }) => {
			try {
				const triples = await queryTriples(env.DB, { subject, predicate, object, limit });
				return formatResult(
					triples.length ? `Found ${triples.length} triples` : "No triples found",
					{ items: triples, next_cursor: null },
					"knowledge://graph/triples",
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"update_triple",
		"Update an existing triple's fields",
		{
			id: z.string().describe("Triple ID"),
			predicate: z.string().optional().describe("New predicate"),
			object: z.string().optional().describe("New object"),
			source: z.string().optional().describe("Provenance source"),
			actor: z.string().optional().describe("Who/what updated this"),
			confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
		},
		async ({ id, predicate, object, source, actor, confidence }) => {
			try {
				checkPolicy("update_triple", { id, confidence });
				const triple = await updateTriple(env.DB, id, { predicate, object, source, actor, confidence });
				notify("triple");
				return formatResult(
					`Updated triple ${triple.id}`,
					triple,
					`knowledge://graph/triples/${triple.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"upsert_triple",
		"Create or update a triple by subject+predicate",
		{
			subject: z.string().describe("Subject of the relationship"),
			predicate: z.string().describe("Predicate/verb"),
			object: z.string().describe("Object of the relationship"),
			source: z.string().optional().describe("Provenance source"),
			actor: z.string().optional().describe("Who/what created this"),
			confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
		},
		async ({ subject, predicate, object, source, actor, confidence }) => {
			try {
				checkPolicy("upsert_triple", { subject, predicate, object, confidence });
				const { triple, created } = await upsertTriple(env.DB, { subject, predicate, object, source, actor, confidence });
				notify("triple");
				return formatResult(
					created ? `Created triple ${triple.id}` : `Updated triple ${triple.id}`,
					{ ...triple, created },
					`knowledge://graph/triples/${triple.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"resolve_conflict",
		"Resolve a detected triple conflict",
		{
			conflict_id: z.string().describe("Conflict ID from relate/upsert response"),
			strategy: z.enum(["replace", "retain_both", "reject"]).describe("Resolution strategy"),
		},
		async ({ conflict_id, strategy }) => {
			try {
				const conflict = await loadConflict(conflict_id);
				if (!conflict) {
					throw KnowledgeError.notFound("Conflict", conflict_id);
				}

				await removeConflict(conflict_id);
				const { incoming } = conflict;

				if (strategy === "reject") {
					return formatResult(
						"Conflict rejected — no changes made",
						{ conflict_id, strategy, resolved: true },
						`knowledge://conflicts/${conflict_id}`,
					);
				}

				if (strategy === "replace") {
					const updated = await updateTriple(env.DB, conflict.existing.id, {
						object: incoming.object,
						source: incoming.source ?? undefined,
						actor: incoming.actor ?? undefined,
						confidence: incoming.confidence ?? undefined,
					});
					notify("triple");
					logEvent("conflict_resolved", { conflict_id, strategy, triple_id: updated.id });
					return formatResult(
						`Replaced triple ${updated.id}`,
						{ conflict_id, strategy, triple: updated, resolved: true },
						`knowledge://graph/triples/${updated.id}`,
					);
				}

				// retain_both: create new triple alongside existing
				const triple = await createTriple(env.DB, {
					subject: incoming.subject,
					predicate: incoming.predicate,
					object: incoming.object,
					source: incoming.source ?? undefined,
					actor: incoming.actor ?? undefined,
					confidence: incoming.confidence ?? undefined,
				});
				notify("triple");
				return formatResult(
					`Retained both — created triple ${triple.id}`,
					{ conflict_id, strategy, triple, resolved: true },
					`knowledge://graph/triples/${triple.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	// --- Entity tools ---

	server.tool(
		"upsert_entity",
		"Create or resolve a canonical entity by name",
		{
			name: z.string().describe("Entity name"),
		},
		async ({ name }) => {
			try {
				const { entity, created } = await upsertEntity(env.DB, name);
				if (created) notify("entity");
				return formatResult(
					created ? `Created entity ${entity.id}` : `Resolved entity ${entity.id}`,
					{ ...entity, created },
					`knowledge://entities/${entity.id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"merge_entities",
		"Merge two canonical entities (keep one, absorb the other)",
		{
			keep_id: z.string().describe("Entity ID to keep"),
			merge_id: z.string().describe("Entity ID to merge into the kept one"),
		},
		async ({ keep_id, merge_id }) => {
			try {
				checkPolicy("merge_entities", { keepId: keep_id, mergeId: merge_id });
				const result = await mergeEntities(env.DB, keep_id, merge_id);
				notify("entity");
				logEvent("mutation", { op: "merge_entities", keep_id, merge_id, merged_count: result.merged_count, ok: true });
				return formatResult(
					`Merged entity ${merge_id} into ${keep_id} (${result.merged_count} triples reassigned)`,
					{ keep_id, merge_id, ...result },
					`knowledge://entities/${keep_id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	// --- Undo & history ---

	server.tool(
		"undo",
		"Revert the last N transactions (default: 1)",
		{
			count: z.number().int().min(1).optional().describe("Number of transactions to undo (default: 1)"),
		},
		async ({ count }) => {
			try {
				const reverted = await undoTransactions(env.DB, count ?? 1);
				if (reverted.length === 0) {
					return formatResult("Nothing to undo", { reverted: [] }, "knowledge://history/transactions");
				}
				// Undo can affect entries or triples — notify both
				notify("entry");
				notify("triple");
				return formatResult(
					`Reverted ${reverted.length} transaction(s)`,
					{ reverted },
					"knowledge://history/transactions",
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"history",
		"View recent transaction history",
		{
			limit: z.number().int().min(1).max(100).optional().describe("Max entries to return (default: 20)"),
			entity_type: z.enum(["entry", "triple"]).optional().describe("Filter by entity type"),
		},
		async ({ limit, entity_type }) => {
			try {
				const txns = await getHistory(env.DB, { limit, entity_type });
				return formatResult(
					txns.length ? `${txns.length} transactions` : "No transactions found",
					{ items: txns },
					"knowledge://history/transactions",
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	// --- Ingestion tools ---

	server.tool(
		"ingest",
		"Ingest text content as knowledge entries (sync for small, async for large)",
		{
			content: z.string().describe("Text content to ingest"),
			source: z.string().optional().describe("Provenance source identifier"),
		},
		async ({ content, source }) => {
			try {
				if (shouldProcessAsync(content)) {
					const result = await ingestAsync(env.DB, content, source);
					// No notify here — entries don't exist yet. Notification fires
					// after processIngestionBatch completes in the DO alarm handler.
					return formatResult(
						`Async ingestion started: ${result.task_id}`,
						result,
						`knowledge://ingestion/${result.task_id}`,
					);
				}
				const result = await ingestSync(env.DB, content, source);
				notify("entry");
				return formatResult(
					`Ingested ${result.entries_created} entries (${result.duplicates_skipped} duplicates skipped)`,
					result,
					`knowledge://ingestion/${result.task_id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);

	server.tool(
		"ingestion_status",
		"Check status of an async ingestion task",
		{
			task_id: z.string().describe("Ingestion task ID"),
		},
		async ({ task_id }) => {
			try {
				const status = await getIngestionStatus(env.DB, task_id);
				if (!status) throw KnowledgeError.notFound("Ingestion task", task_id);
				return formatResult(
					`Task ${task_id}: ${status.status} (${status.processed_items}/${status.total_items})`,
					status,
					`knowledge://ingestion/${task_id}`,
				);
			} catch (e) {
				return formatError(e);
			}
		},
	);
}
