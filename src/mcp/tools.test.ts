import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { createD1Mock } from "../test-utils";
import { initSchema } from "../db/schema";
import { createEntry, queryEntries } from "../db/entries";
import { createTriple, queryTriples } from "../db/triples";
import { resetPolicy } from "../domain/policy";
import { KnowledgeError } from "../lib/errors";
import { formatError, type ToolResult } from "../lib/format";
import { registerTools } from "./tools";

let db: D1Database;

interface ResourceBlock {
	type: "resource";
	resource: {
		uri: string;
		mimeType: string;
		text: string;
	};
}

interface ToolHarness {
	call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

interface ToolHarnessOptions {
	ai?: Ai;
	vectorize?: VectorizeIndex;
	storage?: DurableObjectStorage;
}

function createToolHarness(options: ToolHarnessOptions = {}): ToolHarness {
	const tools = new Map<
		string,
		{
			schema: Record<string, z.ZodTypeAny>;
			handler: (args: Record<string, unknown>) => Promise<ToolResult>;
		}
	>();

	const server = {
		tool(
			name: string,
			_desc: string,
			schema: unknown,
			handler: (args: Record<string, unknown>) => Promise<ToolResult>,
		) {
			tools.set(name, { schema: schema as Record<string, z.ZodTypeAny>, handler });
		},
		server: {
			sendResourceUpdated() {
				// no-op for tests
			},
		},
	} as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

	registerTools(
		server,
		{ DB: db, AI: options.ai, VECTORIZE_INDEX: options.vectorize },
		options.storage,
	);

	return {
		async call(name: string, args: Record<string, unknown>) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not registered: ${name}`);

			const parsed = z.object(tool.schema).safeParse(args);
			if (!parsed.success) {
				return formatError(
					KnowledgeError.validation(
						parsed.error.issues[0]?.message ?? "Invalid arguments",
					),
				);
			}

			return tool.handler(parsed.data);
		},
	};
}

function readText(result: ToolResult): string {
	const block = result.content[0] as { type: string; text?: string };
	expect(block.type).toBe("text");
	expect(typeof block.text).toBe("string");
	return block.text as string;
}

function readResource<T>(result: ToolResult): T {
	const resource = result.content.find((b) => b.type === "resource") as ResourceBlock | undefined;
	expect(resource).toBeDefined();
	return JSON.parse(resource!.resource.text) as T;
}

function readError(result: ToolResult): { error: string; message: string; retryable: boolean } {
	expect(result.isError).toBe(true);
	return JSON.parse(readText(result)) as { error: string; message: string; retryable: boolean };
}

beforeEach(async () => {
	db = createD1Mock();
	await initSchema(db);
	resetPolicy();
});

describe("mcp tools", () => {
	test("store: happy path returns text + resource", async () => {
		const tools = createToolHarness();
		const result = await tools.call("store", {
			topic: "ts",
			content: "zod notes",
			tags: ["typescript"],
		});

		expect(result.content).toHaveLength(2);
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(result.content[1]).toMatchObject({ type: "resource" });

		const data = readResource<{ id: string; topic: string; content: string }>(result);
		expect(data.id).toHaveLength(26);
		expect(data.topic).toBe("ts");
		expect(data.content).toBe("zod notes");
	});

	test("store: policy violation (empty content) returns error", async () => {
		const tools = createToolHarness();
		const result = await tools.call("store", { topic: "ts", content: "" });

		const err = readError(result);
		expect(err.error).toBe("policy");
	});

	test("store: confidence out of range returns validation error", async () => {
		const tools = createToolHarness();
		const result = await tools.call("store", {
			topic: "ts",
			content: "zod notes",
			confidence: 1.5,
		});

		const err = readError(result);
		expect(err.error).toBe("validation");
	});

	test("update: happy path returns resource link", async () => {
		const tools = createToolHarness();
		const created = await createEntry(db, { topic: "old", content: "before" });

		const result = await tools.call("update", {
			id: created.id,
			topic: "new",
			content: "after",
		});

		const resource = result.content.find((b) => b.type === "resource") as
			| ResourceBlock
			| undefined;
		expect(resource).toBeDefined();
		expect(resource!.resource.uri).toBe(`knowledge://entries/${created.id}`);

		const data = readResource<{ id: string; topic: string; content: string }>(result);
		expect(data.id).toBe(created.id);
		expect(data.topic).toBe("new");
		expect(data.content).toBe("after");
	});

	test("update: unknown ID returns not_found", async () => {
		const tools = createToolHarness();
		const result = await tools.call("update", { id: "missing-id", topic: "new" });

		const err = readError(result);
		expect(err.error).toBe("not_found");
	});

	test("query: tag-only uses fallback path", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "a", content: "c1", tags: ["x"] });
		await createEntry(db, { topic: "b", content: "c2", tags: ["x", "y"] });

		const result = await tools.call("query", { tags: ["x"] });
		const data = readResource<
			{ items: Array<{ id: string }>; next_cursor: string | null } & { retrieval_ms?: number }
		>(result);

		expect(data.items).toHaveLength(2);
		expect(data.next_cursor).toBeNull();
		expect(data.retrieval_ms).toBeUndefined();
	});

	test("query: topic + tags runs hybrid then tag post-filter", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "alpha one", content: "c1", tags: ["keep"] });
		await createEntry(db, { topic: "alpha two", content: "c2", tags: ["drop"] });

		const result = await tools.call("query", { topic: "alpha", tags: ["keep"], limit: 10 });
		const data = readResource<{
			items: Array<{ topic: string; tags: string[] }>;
			retrieval_ms: number;
		}>(result);

		expect(data.items).toHaveLength(1);
		expect(data.items[0].topic).toBe("alpha one");
		expect(data.items[0].tags).toContain("keep");
		expect(typeof data.retrieval_ms).toBe("number");
	});

	test("query: returns next_cursor when results exceed limit", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "cursor topic 1", content: "a" });
		await createEntry(db, { topic: "cursor topic 2", content: "b" });
		await createEntry(db, { topic: "cursor topic 3", content: "c" });

		const result = await tools.call("query", { topic: "cursor", limit: 2 });
		const data = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			result,
		);

		expect(data.items).toHaveLength(2);
		expect(data.next_cursor).not.toBeNull();

		const page2Result = await tools.call("query", {
			topic: "cursor",
			limit: 2,
			cursor: data.next_cursor!,
		});
		const page2 = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			page2Result,
		);
		expect(page2.items).toHaveLength(1);
		expect(page2.next_cursor).toBeNull();

		const page1Ids = new Set(data.items.map((item) => item.id));
		expect(page2.items.every((item) => !page1Ids.has(item.id))).toBe(true);
	});

	test("query: tag-only path returns next_cursor", async () => {
		const tools = createToolHarness();
		for (let i = 0; i < 5; i++) {
			await createEntry(db, { topic: `tag-${i}`, content: "c", tags: ["t"] });
		}
		const result = await tools.call("query", { tags: ["t"], limit: 2 });
		const data = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			result,
		);
		expect(data.items).toHaveLength(2);
		expect(data.next_cursor).not.toBeNull();
	});

	test("query with both topic and content combines both terms", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "alpha training", content: "vo2max" });
		await createEntry(db, { topic: "alpha", content: "unrelated" });

		const result = await tools.call("query", { topic: "alpha", content: "vo2max", limit: 10 });
		const data = readResource<{ items: Array<{ topic: string; content: string }> }>(result);
		expect(data.items.some((i) => i.topic === "alpha training")).toBe(true);
		expect(data.items.some((i) => i.topic === "alpha" && i.content === "unrelated")).toBe(true);
	});

	test("query_graph cursor returns next_cursor when more triples exist", async () => {
		const tools = createToolHarness();
		for (let i = 0; i < 5; i++) {
			await createTriple(db, { subject: "cursor-subj", predicate: "is", object: `o${i}` });
		}
		const result = await tools.call("query_graph", { subject: "cursor-subj", limit: 2 });
		const data = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			result,
		);
		expect(data.items).toHaveLength(2);
		expect(data.next_cursor).not.toBeNull();
	});

	test("query_graph cursor second page does not overlap first", async () => {
		const tools = createToolHarness();
		for (let i = 0; i < 5; i++) {
			await createTriple(db, { subject: "cursor-page", predicate: "is", object: `o${i}` });
		}

		const page1Result = await tools.call("query_graph", { subject: "cursor-page", limit: 2 });
		const page1 = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			page1Result,
		);
		expect(page1.next_cursor).not.toBeNull();
		const page2Result = await tools.call("query_graph", {
			subject: "cursor-page",
			limit: 2,
			cursor: page1.next_cursor!,
		});
		const page2 = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			page2Result,
		);
		const firstIds = new Set(page1.items.map((i) => i.id));
		expect(page2.items.every((i) => !firstIds.has(i.id))).toBe(true);
	});

	test("delete: entry path deletes entry", async () => {
		const tools = createToolHarness();
		const entry = await createEntry(db, { topic: "delete-me", content: "content" });

		const result = await tools.call("delete", { id: entry.id, entity_type: "entry" });
		const data = readResource<{ id: string; entity_type: string; deleted: boolean }>(result);
		expect(data).toMatchObject({ id: entry.id, entity_type: "entry", deleted: true });

		const { items: rows } = await queryEntries(db, { topic: "delete-me" });
		expect(rows).toHaveLength(0);
	});

	test("delete: triple path deletes triple", async () => {
		const tools = createToolHarness();
		const triple = await createTriple(db, { subject: "A", predicate: "is", object: "B" });

		const result = await tools.call("delete", { id: triple.id, entity_type: "triple" });
		const data = readResource<{ id: string; entity_type: string; deleted: boolean }>(result);
		expect(data).toMatchObject({ id: triple.id, entity_type: "triple", deleted: true });

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(0);
	});

	test("delete: defaults to entry when entity_type omitted", async () => {
		const tools = createToolHarness();
		const entry = await createEntry(db, { topic: "default-delete", content: "content" });

		const result = await tools.call("delete", { id: entry.id });
		const data = readResource<{ id: string; entity_type: string; deleted: boolean }>(result);
		expect(data).toMatchObject({ id: entry.id, entity_type: "entry", deleted: true });

		const { items: rows } = await queryEntries(db, { topic: "default-delete" });
		expect(rows).toHaveLength(0);
	});

	test("delete: entry still succeeds when Vectorize deletion fails", async () => {
		const tools = createToolHarness({
			vectorize: {
				async deleteByIds() {
					throw new Error("vectorize unavailable");
				},
			} as unknown as VectorizeIndex,
		});
		const entry = await createEntry(db, {
			topic: "delete-vectorize-failure",
			content: "content",
		});

		const result = await tools.call("delete", { id: entry.id, entity_type: "entry" });
		const data = readResource<{ id: string; entity_type: string; deleted: boolean }>(result);
		expect(data).toMatchObject({ id: entry.id, entity_type: "entry", deleted: true });

		const { items: rows } = await queryEntries(db, { topic: "delete-vectorize-failure" });
		expect(rows).toHaveLength(0);
	});

	test("relate: no conflict creates triple", async () => {
		const tools = createToolHarness();
		const result = await tools.call("relate", { subject: "A", predicate: "is", object: "B" });

		const triple = readResource<{
			id: string;
			subject: string;
			predicate: string;
			object: string;
		}>(result);
		expect(triple.subject).toBe("A");
		expect(triple.predicate).toBe("is");
		expect(triple.object).toBe("B");

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(1);
	});

	test("relate: conflict returns conflict_id and does not create new triple", async () => {
		const tools = createToolHarness();
		await createTriple(db, { subject: "A", predicate: "is", object: "old" });

		const result = await tools.call("relate", { subject: "A", predicate: "is", object: "new" });
		const conflict = readResource<{ conflict_id: string }>(result);

		expect(conflict.conflict_id).toHaveLength(26);

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(1);
		expect(rows[0].object).toBe("old");
	});

	test("relate: policy violation returns error", async () => {
		const tools = createToolHarness();
		const result = await tools.call("relate", {
			subject: "",
			predicate: "is",
			object: "B",
		});

		const err = readError(result);
		expect(err.error).toBe("policy");
	});

	test("resolve_conflict: reject resolves with no DB change", async () => {
		const tools = createToolHarness();
		await createTriple(db, { subject: "A", predicate: "is", object: "old" });
		const conflictResult = await tools.call("relate", {
			subject: "A",
			predicate: "is",
			object: "new",
		});
		const conflict = readResource<{ conflict_id: string }>(conflictResult);

		const result = await tools.call("resolve_conflict", {
			conflict_id: conflict.conflict_id,
			strategy: "reject",
		});
		const data = readResource<{ resolved: boolean; strategy: string }>(result);

		expect(data.resolved).toBe(true);
		expect(data.strategy).toBe("reject");

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(1);
		expect(rows[0].object).toBe("old");
	});

	test("resolve_conflict: replace updates existing triple", async () => {
		const tools = createToolHarness();
		await createTriple(db, { subject: "A", predicate: "is", object: "old" });
		const conflictResult = await tools.call("relate", {
			subject: "A",
			predicate: "is",
			object: "new",
		});
		const conflict = readResource<{ conflict_id: string }>(conflictResult);

		const result = await tools.call("resolve_conflict", {
			conflict_id: conflict.conflict_id,
			strategy: "replace",
		});
		const data = readResource<{
			resolved: boolean;
			strategy: string;
			triple: { object: string };
		}>(result);

		expect(data.resolved).toBe(true);
		expect(data.strategy).toBe("replace");
		expect(data.triple.object).toBe("new");

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(1);
		expect(rows[0].object).toBe("new");
	});

	test("resolve_conflict: retain_both creates a new triple", async () => {
		const tools = createToolHarness();
		await createTriple(db, { subject: "A", predicate: "is", object: "old" });
		const conflictResult = await tools.call("relate", {
			subject: "A",
			predicate: "is",
			object: "new",
		});
		const conflict = readResource<{ conflict_id: string }>(conflictResult);

		const result = await tools.call("resolve_conflict", {
			conflict_id: conflict.conflict_id,
			strategy: "retain_both",
		});
		const data = readResource<{ resolved: boolean; strategy: string }>(result);

		expect(data.resolved).toBe(true);
		expect(data.strategy).toBe("retain_both");

		const { items: rows } = await queryTriples(db, { subject: "A", predicate: "is" });
		expect(rows).toHaveLength(2);
		expect(rows.some((row) => row.object === "old")).toBe(true);
		expect(rows.some((row) => row.object === "new")).toBe(true);
	});

	test("resolve_conflict: unknown conflict_id returns not_found", async () => {
		const tools = createToolHarness();
		const result = await tools.call("resolve_conflict", {
			conflict_id: "missing",
			strategy: "reject",
		});

		const err = readError(result);
		expect(err.error).toBe("not_found");
	});

	test("resolve_conflict: expired conflict returns not_found", async () => {
		const tools = createToolHarness();
		const fakeConflict = {
			conflict_id: "expired-id",
			scope: "A/is",
			existing: { id: "x", subject: "A", predicate: "is", object: "B" },
			incoming: { subject: "A", predicate: "is", object: "C" },
			candidate_resolutions: ["replace", "retain_both", "reject"],
		};
		await db
			.prepare(
				`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?)`,
			)
			.bind(
				"expired-id",
				"A/is",
				JSON.stringify(fakeConflict),
				new Date().toISOString(),
				new Date(Date.now() - 1000).toISOString(),
			)
			.run();

		const result = await tools.call("resolve_conflict", {
			conflict_id: "expired-id",
			strategy: "reject",
		});
		const err = readError(result);
		expect(err.error).toBe("not_found");
	});

	test("upsert_entity: new and existing responses", async () => {
		const tools = createToolHarness();

		const created = await tools.call("upsert_entity", { name: "Acme" });
		const createdData = readResource<{ id: string; created: boolean }>(created);
		expect(createdData.created).toBe(true);

		const existing = await tools.call("upsert_entity", { name: "Acme" });
		const existingData = readResource<{ id: string; created: boolean }>(existing);
		expect(existingData.created).toBe(false);
		expect(existingData.id).toBe(createdData.id);
	});

	test("merge_entities: happy path returns merged_count", async () => {
		const tools = createToolHarness();
		const keep = readResource<{ id: string }>(
			await tools.call("upsert_entity", { name: "Alpha" }),
		);
		const merge = readResource<{ id: string }>(
			await tools.call("upsert_entity", { name: "Beta" }),
		);

		await createTriple(db, { subject: "Beta", predicate: "is", object: "Thing" });

		const result = await tools.call("merge_entities", {
			keep_id: keep.id,
			merge_id: merge.id,
		});
		const data = readResource<{ merged_count: number }>(result);

		expect(data.merged_count).toBe(1);
	});

	test("merge_entities: requires both IDs", async () => {
		const tools = createToolHarness();
		const keep = readResource<{ id: string }>(
			await tools.call("upsert_entity", { name: "Alpha" }),
		);

		const result = await tools.call("merge_entities", {
			keep_id: keep.id,
			merge_id: "",
		});

		const err = readError(result);
		expect(err.error).toBe("policy");
	});

	test("undo: nothing to undo returns expected message", async () => {
		const tools = createToolHarness();
		const result = await tools.call("undo", {});

		expect(readText(result)).toContain("Nothing to undo");
		const data = readResource<{ reverted: string[] }>(result);
		expect(data.reverted).toHaveLength(0);
	});

	test("undo: reverts N transactions", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "undo-1", content: "a" });
		await createEntry(db, { topic: "undo-2", content: "b" });

		const result = await tools.call("undo", { count: 2 });
		const data = readResource<{ reverted: string[] }>(result);
		expect(data.reverted).toHaveLength(2);

		const { items: entries } = await queryEntries(db, { topic: "undo-" });
		expect(entries).toHaveLength(0);
	});

	test("history: applies entity_type filter", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "h-entry", content: "a" });
		await createTriple(db, { subject: "h", predicate: "is", object: "triple" });

		const result = await tools.call("history", { entity_type: "entry", limit: 20 });
		const data = readResource<{ items: Array<{ entity_type: string }> }>(result);

		expect(data.items.length).toBeGreaterThan(0);
		expect(data.items.every((item) => item.entity_type === "entry")).toBe(true);
	});

	test("history: respects limit", async () => {
		const tools = createToolHarness();
		await createEntry(db, { topic: "h1", content: "1" });
		await createEntry(db, { topic: "h2", content: "2" });

		const result = await tools.call("history", { limit: 1 });
		const data = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			result,
		);

		expect(data.items).toHaveLength(1);
		expect(data.next_cursor).not.toBeNull();
	});

	test("history cursor returns next_cursor when more transactions exist", async () => {
		const tools = createToolHarness();
		for (let i = 0; i < 5; i++) {
			await createEntry(db, { topic: `h-cursor-${i}`, content: "x" });
		}
		const result = await tools.call("history", { limit: 2 });
		const data = readResource<{ items: Array<{ id: string }>; next_cursor: string | null }>(
			result,
		);
		expect(data.items).toHaveLength(2);
		expect(data.next_cursor).not.toBeNull();
	});

	test("ingest: small content is sync and returns entries_created", async () => {
		const tools = createToolHarness();
		const content = "First paragraph.\n\nSecond paragraph.";

		const result = await tools.call("ingest", { content, source: "test" });
		const data = readResource<{ entries_created: number; task_id: string }>(result);

		expect(data.entries_created).toBeGreaterThan(0);
		expect(data.task_id).toHaveLength(26);
	});

	test("ingest: large content is async and returns task_id", async () => {
		const tools = createToolHarness();
		const result = await tools.call("ingest", {
			content: "x".repeat(5001),
			source: "test",
		});
		const data = readResource<{ task_id: string; entries_created?: number }>(result);

		expect(data.task_id).toHaveLength(26);
		expect(data.entries_created).toBeUndefined();
	});

	test("ingestion_status: known task returns status", async () => {
		const tools = createToolHarness();
		const ingest = await tools.call("ingest", {
			content: "x".repeat(5001),
			source: "status-test",
		});
		const task = readResource<{ task_id: string }>(ingest);

		const statusResult = await tools.call("ingestion_status", { task_id: task.task_id });
		const status = readResource<{
			id: string;
			status: string;
			total_items: number;
			processed_items: number;
		}>(statusResult);

		expect(status.id).toBe(task.task_id);
		expect(status.status).toBe("pending");
		expect(status.total_items).toBeGreaterThan(0);
		expect(status.processed_items).toBe(0);
	});

	test("ingestion_status: unknown task returns not_found", async () => {
		const tools = createToolHarness();
		const result = await tools.call("ingestion_status", { task_id: "missing" });

		const err = readError(result);
		expect(err.error).toBe("not_found");
	});

	test("time: valid timezone returns formatted string", async () => {
		const tools = createToolHarness();
		const result = await tools.call("time", { timezone: "America/New_York" });

		expect(readText(result)).toMatch(/\(America\/New_York\)$/);
	});

	test("time: invalid timezone returns validation error", async () => {
		const tools = createToolHarness();
		const result = await tools.call("time", { timezone: "Invalid/Timezone" });

		const err = readError(result);
		expect(err.error).toBe("validation");
	});
});
