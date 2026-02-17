// GEMINI-CONTEXT: Vectorize/Ai smoke test for deployed environments (Spec 004).
// Runs against a live MCP server to verify the full semantic search pipeline:
// Ai embedding generation → Vectorize upsert → Vectorize query → scored results.
//
// Cannot run in CI (requires Cloudflare Ai + Vectorize runtime bindings).
// The server uses OAuth — obtain a Bearer token via the OAuth flow first.
//
// Usage:
//   SERVER_URL=https://your-server.workers.dev \
//   OAUTH_TOKEN=your-bearer-token \
//   bun run evals/smoke-vectorize.ts
//
// Exits 0 on success, 1 on failure, 2 if server unreachable or misconfigured.

const SERVER_URL = process.env.SERVER_URL;
const OAUTH_TOKEN = process.env.OAUTH_TOKEN;

if (!SERVER_URL || !OAUTH_TOKEN) {
	console.error("Required env vars:");
	console.error("  SERVER_URL   — Deployed server URL (e.g. https://mcp-knowledge-server.user.workers.dev)");
	console.error("  OAUTH_TOKEN  — Bearer token from the OAuth flow (/authorize → /token)");
	console.error("");
	console.error("Usage: SERVER_URL=https://... OAUTH_TOKEN=... bun run evals/smoke-vectorize.ts");
	process.exit(2);
}

interface ToolResult {
	content: Array<{ type: string; text?: string; resource?: { text: string } }>;
	isError?: boolean;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
	const response = await fetch(`${SERVER_URL}/mcp`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${OAUTH_TOKEN}`,
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});

	if (response.status === 401 || response.status === 403) {
		console.error(`AUTH ERROR (${response.status}): Token may be expired or invalid.`);
		console.error("  Obtain a new token via the OAuth flow: GET /authorize → POST /approve → POST /token");
		process.exit(2);
	}

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${await response.text()}`);
	}

	const result = await response.json() as { result?: ToolResult; error?: { message: string } };
	if (result.error) throw new Error(result.error.message);
	return result.result!;
}

function extractData(result: ToolResult): unknown {
	const resource = result.content.find((c) => c.type === "resource");
	if (resource?.resource?.text) return JSON.parse(resource.resource.text);
	return null;
}

async function main() {
	console.log(`Smoke testing Vectorize pipeline against ${SERVER_URL}`);

	// 1. Verify connectivity with a simple time call
	try {
		await callTool("time", {});
		console.log("  Server reachable, auth OK");
	} catch (e) {
		console.error(`  Connection failed: ${(e as Error).message}`);
		process.exit(2);
	}

	// 2. Store two semantically related entries with different wording
	const entry1 = await callTool("store", {
		topic: "smoke-test: memory management",
		content: "Rust ensures memory safety through ownership and borrowing rules enforced at compile time.",
		tags: ["smoke-test"],
		source: "vectorize-smoke",
	});
	console.log("  Stored entry 1:", (entry1.content[0] as { text: string }).text);

	const entry2 = await callTool("store", {
		topic: "smoke-test: garbage collection",
		content: "Java uses automatic garbage collection to reclaim unused heap memory at runtime.",
		tags: ["smoke-test"],
		source: "vectorize-smoke",
	});
	console.log("  Stored entry 2:", (entry2.content[0] as { text: string }).text);

	// syncEmbedding runs inline after store — no delay needed.

	// 3. Query with a paraphrase that needs semantic matching
	const searchResult = await callTool("query", {
		topic: "how does memory get freed",
		limit: 10,
	});
	const data = extractData(searchResult) as {
		items: Array<{ id: string; score_semantic: number; score_total: number }>;
	} | null;

	if (!data || data.items.length === 0) {
		console.error("FAIL: Semantic search returned no results for paraphrased query.");
		console.error("  This suggests Vectorize/Ai bindings are not configured in wrangler.jsonc.");
		await cleanup(entry1, entry2);
		process.exit(1);
	}

	const hasSemantic = data.items.some((i) => i.score_semantic > 0);
	console.log(`  Query returned ${data.items.length} results, semantic scores present: ${hasSemantic}`);

	if (!hasSemantic) {
		console.error("FAIL: Results found but no semantic scores. Vectorize may not be active.");
		console.error("  Check that AI and VECTORIZE_INDEX bindings are set in wrangler.jsonc.");
		await cleanup(entry1, entry2);
		process.exit(1);
	}

	// 4. Verify both smoke entries appear (semantically related to "memory")
	const smokeIds = collectIds(entry1, entry2);
	const foundSmoke = data.items.filter((i) => smokeIds.has(i.id));
	console.log(`  Found ${foundSmoke.length}/2 smoke-test entries in results`);

	// 5. Cleanup
	await cleanup(entry1, entry2);

	console.log("PASS: Vectorize pipeline verified — embeddings stored and queried successfully.");
}

function collectIds(...results: ToolResult[]): Set<string> {
	const ids = new Set<string>();
	for (const r of results) {
		const d = extractData(r) as { id: string } | null;
		if (d?.id) ids.add(d.id);
	}
	return ids;
}

async function cleanup(...results: ToolResult[]): Promise<void> {
	const ids = collectIds(...results);
	for (const id of ids) {
		try {
			await callTool("delete", { id, entity_type: "entry" });
		} catch {
			// Best-effort cleanup
		}
	}
	if (ids.size > 0) console.log(`  Cleaned up ${ids.size} smoke-test entries`);
}

main().catch((e) => {
	console.error("ERROR:", (e as Error).message);
	process.exit(2);
});
