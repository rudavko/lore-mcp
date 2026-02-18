import { beforeEach, describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolResult } from "../lib/format";
import { createD1Mock } from "../test-utils";
import { initSchema } from "../db/schema";
import { createTriple, queryTriples } from "../db/triples";
import { registerTools } from "./tools";

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();
	server = {
		sendResourceUpdated: (_: { uri: string }) => undefined,
	};

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}

	getTool(name: string): ToolHandler {
		const handler = this.handlers.get(name);
		if (!handler) throw new Error(`Tool ${name} was not registered`);
		return handler;
	}
}

function readErrorCode(result: ToolResult): string | null {
	if (!result.isError) return null;
	const text = result.content[0];
	if (text?.type !== "text") return null;
	try {
		const parsed = JSON.parse(text.text) as { error?: string };
		return parsed.error ?? null;
	} catch {
		return null;
	}
}

function readResource<T>(result: ToolResult): T {
	const resource = result.content.find((block) => block.type === "resource");
	if (!resource || resource.type !== "resource") {
		throw new Error("Expected resource content");
	}
	return JSON.parse(resource.resource.text) as T;
}

describe("mcp tools conflict round-trip", () => {
	let db: D1Database;

	beforeEach(async () => {
		db = createD1Mock();
		await initSchema(db);
	});

	test("relate conflict can be resolved from a fresh tool context", async () => {
		await createTriple(db, { subject: "Rust", predicate: "creator", object: "Graydon Hoare" });

		const ctx1 = new MockMcpServer();
		registerTools(ctx1 as unknown as McpServer, { DB: db });
		const relate = ctx1.getTool("relate");
		const relateResult = await relate({
			subject: "Rust",
			predicate: "creator",
			object: "Someone Else",
			confidence: 0.7,
		});
		expect(relateResult.isError).toBeUndefined();
		const conflict = readResource<{ conflict_id: string }>(relateResult);

		const ctx2 = new MockMcpServer();
		registerTools(ctx2 as unknown as McpServer, { DB: db });
		const resolveConflict = ctx2.getTool("resolve_conflict");
		const resolveResult = await resolveConflict({
			conflict_id: conflict.conflict_id,
			strategy: "replace",
		});

		expect(resolveResult.isError).toBeUndefined();
		const { items: triples } = await queryTriples(db, { subject: "Rust", predicate: "creator" });
		expect(triples).toHaveLength(1);
		expect(triples[0].object).toBe("Someone Else");

		const row = await db.prepare(
			`SELECT COUNT(*) AS total FROM conflicts WHERE conflict_id = ?`,
		).bind(conflict.conflict_id).first();
		expect(Number((row as Record<string, unknown> | null)?.total ?? 0)).toBe(0);
	});

	test("expired conflict returns not_found and is cleaned up", async () => {
		await createTriple(db, { subject: "Bun", predicate: "runtime_for", object: "JavaScript" });

		const ctx1 = new MockMcpServer();
		registerTools(ctx1 as unknown as McpServer, { DB: db });
		const relate = ctx1.getTool("relate");
		const relateResult = await relate({
			subject: "Bun",
			predicate: "runtime_for",
			object: "TypeScript",
		});
		const conflict = readResource<{ conflict_id: string }>(relateResult);

		await db.prepare(
			`UPDATE conflicts SET expires_at = ? WHERE conflict_id = ?`,
		).bind(new Date(Date.now() - 1).toISOString(), conflict.conflict_id).run();

		const ctx2 = new MockMcpServer();
		registerTools(ctx2 as unknown as McpServer, { DB: db });
		const resolveConflict = ctx2.getTool("resolve_conflict");
		const resolveResult = await resolveConflict({
			conflict_id: conflict.conflict_id,
			strategy: "reject",
		});

		expect(resolveResult.isError).toBe(true);
		expect(readErrorCode(resolveResult)).toBe("not_found");

		const row = await db.prepare(
			`SELECT COUNT(*) AS total FROM conflicts WHERE conflict_id = ?`,
		).bind(conflict.conflict_id).first();
		expect(Number((row as Record<string, unknown> | null)?.total ?? 0)).toBe(0);
	});
});
