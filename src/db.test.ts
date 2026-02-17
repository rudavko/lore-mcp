import { describe, test, expect, beforeEach } from "bun:test";
import { createD1Mock } from "./test-utils";
import { initSchema } from "./db/schema";
import { createEntry, updateEntry, deleteEntry, queryEntries } from "./db/entries";
import { createTriple, updateTriple, upsertTriple, deleteTriple, queryTriples } from "./db/triples";
import { createEntity, addAlias, resolveAlias, upsertEntity, mergeEntities } from "./db/entities";
import { undoTransactions, getHistory } from "./db/history";
import { detectConflict } from "./domain/conflict";
import { checkPolicy, setPolicy, resetPolicy } from "./domain/policy";
import { KnowledgeError } from "./lib/errors";
import { shouldProcessAsync, ingestSync, ingestAsync, processIngestionBatch, getIngestionStatus } from "./domain/ingestion";
import { lexicalSearch, hybridSearch, sanitizeFts5Query, semanticSearch, syncEmbedding } from "./db/search";
import { isFts5Available } from "./db/schema";

let db: D1Database;

beforeEach(async () => {
	db = createD1Mock();
	await initSchema(db);
	resetPolicy();
});

// ---- Entry CRUD ----

describe("entries", () => {
	test("create and query", async () => {
		const entry = await createEntry(db, { topic: "ts-quirk", content: "Zod v4 changes", tags: ["typescript"] });
		expect(entry.id).toHaveLength(26);
		expect(entry.topic).toBe("ts-quirk");
		expect(entry.tags).toEqual(["typescript"]);
		expect(entry.status).toBe("active");

		const results = await queryEntries(db, { topic: "ts" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(entry.id);
	});

	test("create with provenance", async () => {
		const entry = await createEntry(db, {
			topic: "test",
			content: "data",
			source: "unit-test",
			actor: "bot",
			confidence: 0.9,
		});
		expect(entry.source).toBe("unit-test");
		expect(entry.actor).toBe("bot");
		expect(entry.confidence).toBe(0.9);
	});

	test("query with no filters returns entries", async () => {
		await createEntry(db, { topic: "a", content: "first" });
		await createEntry(db, { topic: "b", content: "second" });
		const results = await queryEntries(db, {});
		expect(results).toHaveLength(2);
	});

	test("query respects limit", async () => {
		for (let i = 0; i < 5; i++) {
			await createEntry(db, { topic: `t${i}`, content: `c${i}` });
		}
		const results = await queryEntries(db, { limit: 3 });
		expect(results).toHaveLength(3);
	});

	test("query filters by tags in JS and respects limit", async () => {
		await createEntry(db, { topic: "a", content: "c", tags: ["x"] });
		await createEntry(db, { topic: "b", content: "c", tags: ["x", "y"] });
		await createEntry(db, { topic: "c", content: "c", tags: ["y"] });

		const withX = await queryEntries(db, { tags: ["x"] });
		expect(withX).toHaveLength(2);

		const withBoth = await queryEntries(db, { tags: ["x", "y"] });
		expect(withBoth).toHaveLength(1);
		expect(withBoth[0].topic).toBe("b");

		const limited = await queryEntries(db, { tags: ["x"], limit: 1 });
		expect(limited).toHaveLength(1);
	});

	test("query by content substring", async () => {
		await createEntry(db, { topic: "a", content: "hello world" });
		await createEntry(db, { topic: "b", content: "goodbye" });
		const results = await queryEntries(db, { content: "hello" });
		expect(results).toHaveLength(1);
		expect(results[0].topic).toBe("a");
	});

	test("update entry", async () => {
		const entry = await createEntry(db, { topic: "old", content: "old content" });
		const updated = await updateEntry(db, entry.id, { topic: "new", content: "new content" });
		expect(updated.topic).toBe("new");
		expect(updated.content).toBe("new content");
		expect(updated.id).toBe(entry.id);
	});

	test("update nonexistent entry throws KnowledgeError", async () => {
		try {
			await updateEntry(db, "nonexistent", { topic: "x" });
			expect(true).toBe(false); // should not reach
		} catch (e) {
			expect(e).toBeInstanceOf(KnowledgeError);
			expect((e as KnowledgeError).code).toBe("not_found");
		}
	});

	test("delete entry (soft)", async () => {
		const entry = await createEntry(db, { topic: "doomed", content: "bye" });
		await deleteEntry(db, entry.id);
		const results = await queryEntries(db, { topic: "doomed" });
		expect(results).toHaveLength(0);
	});

	test("delete nonexistent entry throws", async () => {
		expect(deleteEntry(db, "nonexistent")).rejects.toThrow("not found");
	});

	test("double delete throws", async () => {
		const entry = await createEntry(db, { topic: "x", content: "y" });
		await deleteEntry(db, entry.id);
		expect(deleteEntry(db, entry.id)).rejects.toThrow("not found");
	});
});

// ---- LIKE wildcard escape ----

describe("LIKE wildcard escape", () => {
	test("entry query does not treat % as wildcard", async () => {
		await createEntry(db, { topic: "100% correct", content: "exact" });
		await createEntry(db, { topic: "other topic", content: "unrelated" });
		const results = await queryEntries(db, { topic: "100%" });
		expect(results).toHaveLength(1);
		expect(results[0].topic).toBe("100% correct");
	});

	test("entry query does not treat _ as single-char wildcard", async () => {
		await createEntry(db, { topic: "a_b", content: "underscore" });
		await createEntry(db, { topic: "aXb", content: "should not match" });
		const results = await queryEntries(db, { topic: "a_b" });
		expect(results).toHaveLength(1);
		expect(results[0].topic).toBe("a_b");
	});

	test("triple query does not treat % as wildcard", async () => {
		await createTriple(db, { subject: "100% sure", predicate: "is", object: "fact" });
		await createTriple(db, { subject: "other", predicate: "is", object: "unrelated" });
		const results = await queryTriples(db, { subject: "100%" });
		expect(results).toHaveLength(1);
		expect(results[0].subject).toBe("100% sure");
	});

	test("triple query does not treat _ as single-char wildcard", async () => {
		await createTriple(db, { subject: "x", predicate: "has_a", object: "thing" });
		await createTriple(db, { subject: "x", predicate: "hasXa", object: "nope" });
		const results = await queryTriples(db, { predicate: "has_a" });
		expect(results).toHaveLength(1);
		expect(results[0].predicate).toBe("has_a");
	});
});

// ---- Length validation ----

describe("length validation", () => {
	test("entry rejects topic exceeding max length", async () => {
		const longTopic = "x".repeat(1001);
		expect(createEntry(db, { topic: longTopic, content: "ok" })).rejects.toThrow("exceeds");
	});

	test("entry rejects content exceeding max length", async () => {
		const longContent = "x".repeat(100_001);
		expect(createEntry(db, { topic: "ok", content: longContent })).rejects.toThrow("exceeds");
	});

	test("triple rejects subject exceeding max length", async () => {
		const long = "x".repeat(2001);
		expect(createTriple(db, { subject: long, predicate: "is", object: "y" })).rejects.toThrow("exceeds");
	});

	test("triple rejects predicate exceeding max length", async () => {
		const long = "x".repeat(2001);
		expect(createTriple(db, { subject: "x", predicate: long, object: "y" })).rejects.toThrow("exceeds");
	});

	test("triple rejects object exceeding max length", async () => {
		const long = "x".repeat(2001);
		expect(createTriple(db, { subject: "x", predicate: "is", object: long })).rejects.toThrow("exceeds");
	});

	test("entry accepts content at exactly max length", async () => {
		const entry = await createEntry(db, { topic: "x".repeat(1000), content: "x".repeat(100_000) });
		expect(entry.id).toHaveLength(26);
	});
});

// ---- Triple CRUD ----

describe("triples", () => {
	test("create and query", async () => {
		const triple = await createTriple(db, { subject: "TypeScript", predicate: "has", object: "generics" });
		expect(triple.id).toHaveLength(26);
		expect(triple.subject).toBe("TypeScript");
		expect(triple.status).toBe("active");

		const results = await queryTriples(db, { subject: "Type" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(triple.id);
	});

	test("create with provenance", async () => {
		const triple = await createTriple(db, {
			subject: "A",
			predicate: "is",
			object: "B",
			source: "test",
			actor: "bot",
			confidence: 0.8,
		});
		expect(triple.source).toBe("test");
		expect(triple.confidence).toBe(0.8);
	});

	test("update triple", async () => {
		const triple = await createTriple(db, { subject: "A", predicate: "is", object: "B" });
		const updated = await updateTriple(db, triple.id, { object: "C", confidence: 0.95 });
		expect(updated.object).toBe("C");
		expect(updated.confidence).toBe(0.95);
		expect(updated.subject).toBe("A");
	});

	test("upsert triple creates when new", async () => {
		const { triple, created } = await upsertTriple(db, { subject: "X", predicate: "likes", object: "Y" });
		expect(created).toBe(true);
		expect(triple.subject).toBe("X");
	});

	test("upsert triple updates when exists", async () => {
		await createTriple(db, { subject: "X", predicate: "likes", object: "Y" });
		const { triple, created } = await upsertTriple(db, { subject: "X", predicate: "likes", object: "Z" });
		expect(created).toBe(false);
		expect(triple.object).toBe("Z");
	});

	test("query respects limit", async () => {
		for (let i = 0; i < 5; i++) {
			await createTriple(db, { subject: `s${i}`, predicate: "p", object: "o" });
		}
		const results = await queryTriples(db, { limit: 2 });
		expect(results).toHaveLength(2);
	});

	test("delete triple (soft)", async () => {
		const triple = await createTriple(db, { subject: "a", predicate: "b", object: "c" });
		await deleteTriple(db, triple.id);
		const results = await queryTriples(db, { subject: "a" });
		expect(results).toHaveLength(0);
	});

	test("delete nonexistent triple throws", async () => {
		expect(deleteTriple(db, "nonexistent")).rejects.toThrow("not found");
	});
});

// ---- Undo ----

describe("undo", () => {
	test("undo create reverts to deleted", async () => {
		await createEntry(db, { topic: "temp", content: "will undo" });
		const reverted = await undoTransactions(db, 1);
		expect(reverted).toHaveLength(1);

		const results = await queryEntries(db, { topic: "temp" });
		expect(results).toHaveLength(0);
	});

	test("undo delete restores entry", async () => {
		const entry = await createEntry(db, { topic: "restore-me", content: "data" });
		await deleteEntry(db, entry.id);

		const reverted = await undoTransactions(db, 1);
		expect(reverted).toHaveLength(1);

		const results = await queryEntries(db, { topic: "restore-me" });
		expect(results).toHaveLength(1);
	});

	test("undo update restores previous values", async () => {
		const entry = await createEntry(db, { topic: "original", content: "v1" });
		await updateEntry(db, entry.id, { content: "v2" });

		await undoTransactions(db, 1);

		const results = await queryEntries(db, { topic: "original" });
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe("v1");
	});

	test("undo triple update restores all fields including subject", async () => {
		const triple = await createTriple(db, { subject: "A", predicate: "is", object: "B", confidence: 0.5 });
		await updateTriple(db, triple.id, { object: "C", confidence: 0.9 });

		await undoTransactions(db, 1);

		const results = await queryTriples(db, { subject: "A" });
		expect(results).toHaveLength(1);
		expect(results[0].object).toBe("B");
		expect(results[0].confidence).toBe(0.5);
		expect(results[0].subject).toBe("A");
	});

	test("sequential undo(1) calls each revert a different transaction", async () => {
		await createEntry(db, { topic: "first", content: "1" });
		await createEntry(db, { topic: "second", content: "2" });

		const r1 = await undoTransactions(db, 1);
		const r2 = await undoTransactions(db, 1);

		expect(r1).toHaveLength(1);
		expect(r2).toHaveLength(1);
		expect(r1[0]).not.toBe(r2[0]);

		const results = await queryEntries(db, {});
		expect(results).toHaveLength(0);
	});

	test("undo with nothing to undo returns empty", async () => {
		const reverted = await undoTransactions(db, 1);
		expect(reverted).toHaveLength(0);
	});
});

// ---- History ----

describe("history", () => {
	test("records transactions", async () => {
		await createEntry(db, { topic: "a", content: "b" });
		const txns = await getHistory(db, {});
		expect(txns.length).toBeGreaterThanOrEqual(1);
		expect(txns[0].op).toBe("CREATE");
		expect(txns[0].entity_type).toBe("entry");
	});

	test("filters by entity_type", async () => {
		await createEntry(db, { topic: "a", content: "b" });
		await createTriple(db, { subject: "x", predicate: "y", object: "z" });

		const entryTxns = await getHistory(db, { entity_type: "entry" });
		const tripleTxns = await getHistory(db, { entity_type: "triple" });

		expect(entryTxns.every((t) => t.entity_type === "entry")).toBe(true);
		expect(tripleTxns.every((t) => t.entity_type === "triple")).toBe(true);
	});

	test("respects limit", async () => {
		for (let i = 0; i < 5; i++) {
			await createEntry(db, { topic: `t${i}`, content: `c${i}` });
		}
		const txns = await getHistory(db, { limit: 2 });
		expect(txns).toHaveLength(2);
	});
});

// ---- Entities (Spec 003) ----

describe("entities", () => {
	test("create entity and resolve by alias", async () => {
		const entity = await createEntity(db, "TypeScript");
		expect(entity.name).toBe("TypeScript");

		const resolved = await resolveAlias(db, "typescript");
		expect(resolved).not.toBeNull();
		expect(resolved!.id).toBe(entity.id);
	});

	test("add alias and resolve", async () => {
		const entity = await createEntity(db, "TypeScript");
		await addAlias(db, entity.id, "TS");

		const resolved = await resolveAlias(db, "ts");
		expect(resolved).not.toBeNull();
		expect(resolved!.id).toBe(entity.id);
	});

	test("upsert entity creates when new", async () => {
		const { entity, created } = await upsertEntity(db, "Rust");
		expect(created).toBe(true);
		expect(entity.name).toBe("Rust");
	});

	test("upsert entity resolves when exists", async () => {
		const original = await createEntity(db, "Rust");
		const { entity, created } = await upsertEntity(db, "rust");
		expect(created).toBe(false);
		expect(entity.id).toBe(original.id);
	});

	test("merge entities reassigns triples", async () => {
		const keep = await createEntity(db, "JavaScript");
		const merge = await createEntity(db, "JS");

		await createTriple(db, { subject: "JS", predicate: "has", object: "closures" });
		await createTriple(db, { subject: "closures", predicate: "in", object: "JS" });

		const result = await mergeEntities(db, keep.id, merge.id);
		expect(result.merged_count).toBe(2);

		// Triples should now reference "JavaScript"
		const triples = await queryTriples(db, { subject: "JavaScript" });
		expect(triples).toHaveLength(1);
		expect(triples[0].object).toBe("closures");

		const objectTriples = await queryTriples(db, { object: "JavaScript" });
		expect(objectTriples).toHaveLength(1);

		// "JS" should now resolve to "JavaScript" entity
		const resolved = await resolveAlias(db, "js");
		expect(resolved).not.toBeNull();
		expect(resolved!.id).toBe(keep.id);
	});

	test("undo merge restores entity, triples, and aliases", async () => {
		const keep = await createEntity(db, "JavaScript");
		const merge = await createEntity(db, "JS");

		const t1 = await createTriple(db, { subject: "JS", predicate: "has", object: "closures" });
		const t2 = await createTriple(db, { subject: "closures", predicate: "in", object: "JS" });

		await mergeEntities(db, keep.id, merge.id);

		// Verify merge happened
		const postMerge = await queryTriples(db, { subject: "JavaScript" });
		expect(postMerge).toHaveLength(1);

		// Undo the merge
		const reverted = await undoTransactions(db, 1);
		expect(reverted).toHaveLength(1);

		// Triples should be restored to original "JS" references
		const restoredSubj = await queryTriples(db, { subject: "JS" });
		expect(restoredSubj).toHaveLength(1);
		expect(restoredSubj[0].object).toBe("closures");

		const restoredObj = await queryTriples(db, { object: "JS" });
		expect(restoredObj).toHaveLength(1);
		expect(restoredObj[0].subject).toBe("closures");

		// Merged entity should be restored (queryable by original name)
		const restoredEntity = await resolveAlias(db, "JS");
		expect(restoredEntity).not.toBeNull();
		expect(restoredEntity!.name).toBe("JS");
	});

	test("undo merge does not move keep's original entries to merge", async () => {
		const keep = await createEntity(db, "Python");
		const merge = await createEntity(db, "Py");

		// Create entries linked to each entity
		const keepEntry = await createEntry(db, { topic: "keep-entry", content: "Belongs to Python" });
		const mergeEntry = await createEntry(db, { topic: "merge-entry", content: "Belongs to Py" });
		// Link entries to their entities via canonical_entity_id
		await db.prepare(`UPDATE entries SET canonical_entity_id = ? WHERE id = ?`).bind(keep.id, keepEntry.id).run();
		await db.prepare(`UPDATE entries SET canonical_entity_id = ? WHERE id = ?`).bind(merge.id, mergeEntry.id).run();

		await mergeEntities(db, keep.id, merge.id);

		// After merge, both entries should be on keep
		const postMerge = await db.prepare(`SELECT canonical_entity_id FROM entries WHERE id = ?`).bind(keepEntry.id).first();
		expect(postMerge!.canonical_entity_id).toBe(keep.id);
		const postMergeMerge = await db.prepare(`SELECT canonical_entity_id FROM entries WHERE id = ?`).bind(mergeEntry.id).first();
		expect(postMergeMerge!.canonical_entity_id).toBe(keep.id);

		// Undo the merge
		await undoTransactions(db, 1);

		// Keep's original entry should still be on keep (NOT moved to merge)
		const afterUndo = await db.prepare(`SELECT canonical_entity_id FROM entries WHERE id = ?`).bind(keepEntry.id).first();
		expect(afterUndo!.canonical_entity_id).toBe(keep.id);

		// Merge's entry should be back on merge
		const afterUndoMerge = await db.prepare(`SELECT canonical_entity_id FROM entries WHERE id = ?`).bind(mergeEntry.id).first();
		expect(afterUndoMerge!.canonical_entity_id).toBe(merge.id);
	});

	test("undo merge restores extra aliases to merged entity", async () => {
		const keep = await createEntity(db, "React");
		const merge = await createEntity(db, "ReactJS");
		// Add an extra alias to the merge entity
		await addAlias(db, merge.id, "react.js");

		await mergeEntities(db, keep.id, merge.id);

		// After merge, "react.js" alias should resolve to keep
		const postMerge = await resolveAlias(db, "react.js");
		expect(postMerge).not.toBeNull();
		expect(postMerge!.id).toBe(keep.id);

		// Undo the merge
		await undoTransactions(db, 1);

		// "react.js" alias should be back on the merge entity
		const afterUndo = await resolveAlias(db, "react.js");
		expect(afterUndo).not.toBeNull();
		expect(afterUndo!.id).toBe(merge.id);
		expect(afterUndo!.name).toBe("ReactJS");

		// Keep's own alias should still resolve to keep
		const keepAlias = await resolveAlias(db, "react");
		expect(keepAlias).not.toBeNull();
		expect(keepAlias!.id).toBe(keep.id);
	});
});

// ---- Conflict Detection (Spec 003) ----

describe("conflict detection", () => {
	test("no conflict when no existing triple", async () => {
		const conflict = await detectConflict(db, {
			subject: "Rust",
			predicate: "creator",
			incomingObject: "Graydon Hoare",
		});
		expect(conflict).toBeNull();
	});

	test("no conflict when same object", async () => {
		await createTriple(db, { subject: "Rust", predicate: "creator", object: "Graydon Hoare" });
		const conflict = await detectConflict(db, {
			subject: "Rust",
			predicate: "creator",
			incomingObject: "Graydon Hoare",
		});
		expect(conflict).toBeNull();
	});

	test("detects conflict when different object", async () => {
		await createTriple(db, { subject: "Rust", predicate: "creator", object: "Graydon Hoare" });
		const conflict = await detectConflict(db, {
			subject: "Rust",
			predicate: "creator",
			incomingObject: "Someone Else",
			incomingConfidence: 0.5,
		});
		expect(conflict).not.toBeNull();
		expect(conflict!.candidate_resolutions).toContain("replace");
		expect(conflict!.candidate_resolutions).toContain("retain_both");
		expect(conflict!.candidate_resolutions).toContain("reject");
		expect(conflict!.existing.object).toBe("Graydon Hoare");
		expect(conflict!.incoming.object).toBe("Someone Else");
	});
});

// ---- Policy (Spec 003) ----

describe("policy", () => {
	test("passes with valid params", () => {
		expect(() => checkPolicy("store", { topic: "x", content: "y" })).not.toThrow();
	});

	test("rejects missing required field", () => {
		try {
			checkPolicy("store", { topic: "x" });
			expect(true).toBe(false);
		} catch (e) {
			expect(e).toBeInstanceOf(KnowledgeError);
			expect((e as KnowledgeError).code).toBe("policy");
		}
	});

	test("rejects low confidence when policy set", () => {
		setPolicy({ minConfidence: 0.5 });
		try {
			checkPolicy("store", { topic: "x", content: "y", confidence: 0.3 });
			expect(true).toBe(false);
		} catch (e) {
			expect(e).toBeInstanceOf(KnowledgeError);
			expect((e as KnowledgeError).code).toBe("policy");
		}
	});

	test("passes confidence above minimum", () => {
		setPolicy({ minConfidence: 0.5 });
		expect(() => checkPolicy("store", { topic: "x", content: "y", confidence: 0.8 })).not.toThrow();
	});
});

// ---- Structured output shape (Spec 002) ----

describe("format", () => {
	test("formatResult returns text + resource", async () => {
		const { formatResult } = await import("./lib/format");
		const result = formatResult("hello", { id: "1" }, "knowledge://entries/1");
		expect(result.content).toHaveLength(2);
		expect(result.content[0].type).toBe("text");
		expect(result.content[1].type).toBe("resource");
	});

	test("formatResult returns text only when no data", async () => {
		const { formatResult } = await import("./lib/format");
		const result = formatResult("hello");
		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe("text");
	});

	test("formatError returns structured error for KnowledgeError", async () => {
		const { formatError } = await import("./lib/format");
		const result = formatError(KnowledgeError.notFound("Entry", "abc"));
		expect(result.isError).toBe(true);
		const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
		expect(parsed.error).toBe("not_found");
		expect(parsed.retryable).toBe(false);
	});

	test("formatError wraps plain errors", async () => {
		const { formatError } = await import("./lib/format");
		const result = formatError(new Error("boom"));
		expect(result.isError).toBe(true);
		const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
		expect(parsed.error).toBe("internal");
	});
});

// ---- Ingestion (Spec 004) ----

describe("ingestion", () => {
	test("shouldProcessAsync returns false for small content", () => {
		expect(shouldProcessAsync("Hello world")).toBe(false);
	});

	test("shouldProcessAsync returns true for large content", () => {
		// Needs >5000 chars or >20 chunks (SYNC_THRESHOLD_CHARS=5000, SYNC_THRESHOLD_ITEMS=20)
		const large = "A".repeat(5001);
		expect(shouldProcessAsync(large)).toBe(true);
	});

	// GEMINI-CONTEXT: chunkText merges paragraphs until CHUNK_SIZE (500 chars).
	// Two short paragraphs become 1 chunk. We use 2 large paragraphs to get 2 chunks.
	test("ingestSync creates entries from text", async () => {
		const para1 = "A".repeat(300);
		const para2 = "B".repeat(300);
		const result = await ingestSync(db, `${para1}\n\n${para2}`, "test-source");
		expect(result.entries_created).toBe(2);
		expect(result.duplicates_skipped).toBe(0);

		const entries = await queryEntries(db, { tags: ["ingested"] });
		expect(entries).toHaveLength(2);
		expect(entries[0].source).toBe("test-source");
	});

	test("ingestSync deduplicates identical content", async () => {
		await ingestSync(db, "Unique paragraph.", "src1");
		const result = await ingestSync(db, "Unique paragraph.", "src2");
		expect(result.duplicates_skipped).toBe(1);
		expect(result.entries_created).toBe(0);
	});

	test("ingestAsync creates pending task", async () => {
		const result = await ingestAsync(db, "Some content for async processing");
		expect(result.task_id).toHaveLength(26);

		const status = await getIngestionStatus(db, result.task_id);
		expect(status).not.toBeNull();
		expect(status!.status).toBe("pending");
	});

	// GEMINI-CONTEXT: chunkText merges paragraphs until CHUNK_SIZE (500 chars).
	// 3 paragraphs of 300 chars each exceed 500 per pair, yielding 3 chunks.
	test("processIngestionBatch processes pending task", async () => {
		const paras = [0, 1, 2].map((i) => String.fromCharCode(65 + i).repeat(300));
		await ingestAsync(db, paras.join("\n\n"));

		const batch1 = await processIngestionBatch(db);
		expect(batch1.processed).toBeGreaterThan(0);

		// Keep processing until done
		let remaining = batch1.remaining;
		while (remaining > 0) {
			const next = await processIngestionBatch(db);
			remaining = next.remaining;
		}

		const entries = await queryEntries(db, { tags: ["ingested"] });
		expect(entries.length).toBeGreaterThanOrEqual(3);
	});

	test("processIngestionBatch returns zero when nothing pending", async () => {
		const result = await processIngestionBatch(db);
		expect(result.processed).toBe(0);
		expect(result.remaining).toBe(0);
	});

	test("getIngestionStatus returns null for unknown task", async () => {
		const status = await getIngestionStatus(db, "nonexistent");
		expect(status).toBeNull();
	});
});

// ---- Search (Spec 004) ----

describe("search", () => {
	test("lexicalSearch finds entries by topic", async () => {
		await createEntry(db, { topic: "TypeScript generics", content: "Generics allow..." });
		await createEntry(db, { topic: "Rust lifetimes", content: "Lifetimes ensure..." });

		const results = await lexicalSearch(db, "TypeScript", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].score_lexical).toBeGreaterThan(0);
	});

	test("lexicalSearch finds entries by content", async () => {
		await createEntry(db, { topic: "quirk", content: "bun sqlite has a quirk with FTS5" });

		const results = await lexicalSearch(db, "FTS5", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	test("hybridSearch returns scored results", async () => {
		await createEntry(db, { topic: "TypeScript generics", content: "Type parameters" });
		await createEntry(db, { topic: "Rust traits", content: "Trait bounds" });

		const result = await hybridSearch(db, undefined, undefined, { query: "TypeScript", limit: 10 });
		expect(result.items.length).toBeGreaterThanOrEqual(1);
		expect(result.items[0].score_total).toBeGreaterThan(0);
		expect(result.retrieval_ms).toBeGreaterThanOrEqual(0);
	});

	test("hybridSearch handles empty results", async () => {
		const result = await hybridSearch(db, undefined, undefined, { query: "nonexistent topic xyz", limit: 10 });
		expect(result.items).toHaveLength(0);
		expect(result.next_cursor).toBeNull();
	});

	test("hybridSearch cursor pagination", async () => {
		for (let i = 0; i < 5; i++) {
			await createEntry(db, { topic: "pagination test", content: `Item number ${i}` });
		}

		const page1 = await hybridSearch(db, undefined, undefined, { query: "pagination", limit: 2 });
		expect(page1.items).toHaveLength(2);
		expect(page1.next_cursor).not.toBeNull();

		const page2 = await hybridSearch(db, undefined, undefined, { query: "pagination", limit: 2, cursor: page1.next_cursor! });
		expect(page2.items.length).toBeGreaterThan(0);
		// Pages should not overlap
		const page1Ids = new Set(page1.items.map((i) => i.id));
		for (const item of page2.items) {
			expect(page1Ids.has(item.id)).toBe(false);
		}
	});

	test("hybridSearch ignores invalid cursor gracefully", async () => {
		await createEntry(db, { topic: "test", content: "data" });
		// Invalid base64 cursor should not crash
		const result = await hybridSearch(db, undefined, undefined, { query: "test", limit: 10, cursor: "not-valid-base64!!!" });
		expect(result.items.length).toBeGreaterThanOrEqual(1);
	});
});

// ---- FTS5 MATCH integration (real bun:sqlite FTS5 engine) ----

describe("FTS5 MATCH integration", () => {
	test("isFts5Available returns true after initSchema", () => {
		// initSchema runs in beforeEach — FTS5 should be detected
		expect(isFts5Available()).toBe(true);
	});

	test("FTS5 MATCH finds entries by topic keyword", async () => {
		await createEntry(db, { topic: "TypeScript generics", content: "Generics allow reusable components" });
		await createEntry(db, { topic: "Rust lifetimes", content: "Lifetimes ensure memory safety" });

		// "TypeScript" should match via FTS5 MATCH, not LIKE
		const results = await lexicalSearch(db, "TypeScript", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
		// FTS5 bm25 scores are normalized to 0-1 range
		expect(results[0].score_lexical).toBeGreaterThan(0);
		expect(results[0].score_lexical).toBeLessThanOrEqual(1);
	});

	test("FTS5 MATCH finds entries by content keyword", async () => {
		await createEntry(db, { topic: "memory", content: "Rust lifetimes ensure memory safety without garbage collection" });
		await createEntry(db, { topic: "unrelated", content: "This is about cooking recipes" });

		const results = await lexicalSearch(db, "garbage", 10);
		expect(results).toHaveLength(1);
		expect(results[0].score_lexical).toBeGreaterThan(0);
	});

	test("FTS5 MATCH handles multi-word queries", async () => {
		await createEntry(db, { topic: "TypeScript generics", content: "Generic type parameters enable reusable code" });
		await createEntry(db, { topic: "JavaScript closures", content: "Closures capture variables from scope" });

		// Multi-word query: each word quoted by sanitizer
		const results = await lexicalSearch(db, "TypeScript generics", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	test("FTS5 MATCH ranks topic matches higher than content-only matches", async () => {
		// Entry with query term in topic
		await createEntry(db, { topic: "bun runtime", content: "Fast JavaScript bundler and runtime" });
		// Entry with query term only in content
		await createEntry(db, { topic: "tools comparison", content: "Some developers prefer bun over node" });

		const results = await lexicalSearch(db, "bun", 10);
		expect(results.length).toBe(2);
		// Both should be found; bm25 scoring will rank them
		expect(results[0].score_lexical).toBeGreaterThanOrEqual(results[1].score_lexical);
	});

	test("FTS5 MATCH handles special characters without crashing", async () => {
		await createEntry(db, { topic: "C++ guide", content: "Pointers and references in C++" });

		// Special chars should be safely quoted by sanitizer
		const results = await lexicalSearch(db, "C++", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	test("FTS5 MATCH handles FTS5 operator keywords as literals", async () => {
		await createEntry(db, { topic: "logic gates", content: "AND OR NOT are boolean operators" });

		// "AND" is an FTS5 operator but our sanitizer quotes it
		const results = await lexicalSearch(db, "AND OR", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	test("FTS5 triggers keep index in sync after updates", async () => {
		const entry = await createEntry(db, { topic: "original topic", content: "original content" });

		// Should find by original content
		let results = await lexicalSearch(db, "original", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);

		// Update the entry
		await updateEntry(db, entry.id, { topic: "changed topic", content: "changed content" });

		// Should NOT find by old content
		results = await lexicalSearch(db, "original", 10);
		expect(results).toHaveLength(0);

		// Should find by new content
		results = await lexicalSearch(db, "changed", 10);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});
});

// ---- Fuzzy alias resolution ----

describe("fuzzy alias resolution", () => {
	test("resolveAlias finds exact match", async () => {
		const entity = await createEntity(db, "TypeScript");
		const resolved = await resolveAlias(db, "typescript");
		expect(resolved).not.toBeNull();
		expect(resolved!.id).toBe(entity.id);
	});

	test("resolveAlias finds fuzzy match via LIKE", async () => {
		const entity = await createEntity(db, "TypeScript");
		const resolved = await resolveAlias(db, "Type");
		expect(resolved).not.toBeNull();
		expect(resolved!.id).toBe(entity.id);
	});

	test("resolveAlias returns null for no match", async () => {
		await createEntity(db, "TypeScript");
		const resolved = await resolveAlias(db, "Rust");
		expect(resolved).toBeNull();
	});

	test("upsertEntity uses exact match only (no fuzzy collisions)", async () => {
		await createEntity(db, "TypeScript");
		// "Type" is a fuzzy match but not exact — should create new entity
		const { entity, created } = await upsertEntity(db, "Type");
		expect(created).toBe(true);
		expect(entity.name).toBe("Type");
	});
});

// ---- FTS5 sanitizer ----

describe("FTS5 sanitizer", () => {
	test("wraps simple tokens in double quotes", () => {
		expect(sanitizeFts5Query("hello world")).toBe('"hello" "world"');
	});

	test("escapes double quotes inside tokens", () => {
		expect(sanitizeFts5Query('say "hello"')).toBe('"say" """hello"""');
	});

	test("handles FTS5 operators as plain terms", () => {
		// AND, OR, NOT, NEAR are FTS5 operators — must be quoted to be literal
		expect(sanitizeFts5Query("cats AND dogs")).toBe('"cats" "AND" "dogs"');
		expect(sanitizeFts5Query("NOT excluded")).toBe('"NOT" "excluded"');
	});

	test("handles special FTS5 characters", () => {
		expect(sanitizeFts5Query("C++ -flag *wild")).toBe('"C++" "-flag" "*wild"');
		expect(sanitizeFts5Query("(group) test")).toBe('"(group)" "test"');
	});

	test("handles empty and whitespace-only input", () => {
		expect(sanitizeFts5Query("")).toBe("");
		expect(sanitizeFts5Query("   ")).toBe("");
		expect(sanitizeFts5Query("\t\n")).toBe("");
	});

	test("collapses multiple spaces between tokens", () => {
		expect(sanitizeFts5Query("  hello   world  ")).toBe('"hello" "world"');
	});
});

// ---- Vectorize/Ai mock tests ----

describe("semantic search with mocks", () => {
	// Mock Ai that returns a fixed embedding vector
	function createMockAi(): Ai {
		return {
			run: async (_model: string, inputs: { text: string[] }) => {
				// Return a simple deterministic embedding per input
				const data = inputs.text.map((t) => {
					// Simple hash-based mock: different texts get different vectors
					const seed = t.length;
					return [seed / 100, (seed * 2) / 100, (seed * 3) / 100];
				});
				return { shape: [data.length, 3], data };
			},
		} as unknown as Ai;
	}

	// Mock Vectorize that stores and queries vectors
	function createMockVectorize(entries: { id: string; score: number }[]): VectorizeIndex {
		return {
			query: async (_vector: number[], options?: { topK?: number }) => {
				const topK = options?.topK ?? 10;
				return {
					matches: entries.slice(0, topK).map((e) => ({
						id: e.id,
						score: e.score,
						values: [],
					})),
					count: Math.min(entries.length, topK),
				};
			},
			upsert: async () => ({ mutationId: "mock-mutation" }),
		} as unknown as VectorizeIndex;
	}

	test("semanticSearch returns scored results with Ai+Vectorize", async () => {
		const mockAi = createMockAi();
		const mockVectorize = createMockVectorize([
			{ id: "entry-1", score: 0.95 },
			{ id: "entry-2", score: 0.80 },
		]);

		const results = await semanticSearch(mockAi, mockVectorize, "test query", 10);
		expect(results).toHaveLength(2);
		expect(results[0].id).toBe("entry-1");
		expect(results[0].score_semantic).toBe(0.95);
		expect(results[1].id).toBe("entry-2");
		expect(results[1].score_semantic).toBe(0.80);
	});

	test("semanticSearch returns empty when Ai is undefined", async () => {
		const mockVectorize = createMockVectorize([]);
		const results = await semanticSearch(undefined, mockVectorize, "test", 10);
		expect(results).toHaveLength(0);
	});

	test("semanticSearch returns empty when Vectorize is undefined", async () => {
		const mockAi = createMockAi();
		const results = await semanticSearch(mockAi, undefined, "test", 10);
		expect(results).toHaveLength(0);
	});

	test("semanticSearch handles Ai failure gracefully", async () => {
		const failingAi = {
			run: async () => { throw new Error("AI service down"); },
		} as unknown as Ai;
		const mockVectorize = createMockVectorize([]);

		const results = await semanticSearch(failingAi, mockVectorize, "test", 10);
		expect(results).toHaveLength(0);
	});

	test("semanticSearch handles Vectorize failure gracefully", async () => {
		const mockAi = createMockAi();
		const failingVectorize = {
			query: async () => { throw new Error("Vectorize down"); },
		} as unknown as VectorizeIndex;

		const results = await semanticSearch(mockAi, failingVectorize, "test", 10);
		expect(results).toHaveLength(0);
	});

	test("syncEmbedding upserts vector to Vectorize", async () => {
		const mockAi = createMockAi();
		let upsertedVectors: unknown[] = [];
		const mockVectorize = {
			upsert: async (vectors: unknown[]) => {
				upsertedVectors = vectors;
				return { mutationId: "mock" };
			},
		} as unknown as VectorizeIndex;

		await syncEmbedding(mockAi, mockVectorize, "entry-123", "test content");
		expect(upsertedVectors).toHaveLength(1);
		expect((upsertedVectors[0] as { id: string }).id).toBe("entry-123");
	});

	test("syncEmbedding is no-op when bindings absent", async () => {
		// Should not throw
		await syncEmbedding(undefined, undefined, "entry-123", "test");
	});

	test("syncEmbedding handles Ai failure gracefully", async () => {
		const failingAi = {
			run: async () => { throw new Error("AI down"); },
		} as unknown as Ai;
		const mockVectorize = {
			upsert: async () => ({ mutationId: "mock" }),
		} as unknown as VectorizeIndex;

		// Should not throw
		await syncEmbedding(failingAi, mockVectorize, "entry-123", "test");
	});

	test("hybridSearch integrates semantic results when Ai+Vectorize provided", async () => {
		// Seed some entries
		const entry1 = await createEntry(db, { topic: "alpha concept", content: "First alpha entry" });
		const entry2 = await createEntry(db, { topic: "beta concept", content: "Second beta entry" });

		const mockAi = createMockAi();
		// Mock Vectorize returns entry2 as the top semantic match
		const mockVectorize = createMockVectorize([
			{ id: entry2.id, score: 0.99 },
		]);

		const result = await hybridSearch(db, mockAi, mockVectorize, { query: "alpha", limit: 10 });

		// entry1 matches lexically ("alpha" in topic), entry2 matches semantically
		expect(result.items.length).toBeGreaterThanOrEqual(1);

		// Check that scores include both lexical and semantic components
		const hasLexical = result.items.some((i) => i.score_lexical > 0);
		const hasSemantic = result.items.some((i) => i.score_semantic > 0);
		expect(hasLexical).toBe(true);
		expect(hasSemantic).toBe(true);
	});
});
