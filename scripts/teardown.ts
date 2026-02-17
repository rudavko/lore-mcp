// GEMINI-CONTEXT: Dev-only teardown script — counterpart to setup.ts.
// Runs under Node (not Bun) via --experimental-strip-types.
// Uses Node's execFileSync which handles pipe buffering correctly.
// NAME validated to [a-z0-9-] — safe for interpolation.
// Wrangler auto-confirms deletions when stdin is not a TTY (piped/closed).
// Config reset is intentionally unconditional — returns wrangler.jsonc to a
// clean state for git regardless of which cloud resources still exist.

/**
 * Tears down all Cloudflare resources for a given deployment name.
 *
 * Usage:
 *   npm run teardown                     # tear down "lore-mcp"
 *   npm run teardown -- lore-test-deploy # tear down namespaced deployment
 */

import { execFileSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const W = "./node_modules/.bin/wrangler";
const NAME = process.argv[2] ?? "lore-mcp";
if (!/^[a-z0-9-]+$/.test(NAME)) {
	console.error(`Invalid name: "${NAME}" — must be lowercase alphanumeric with hyphens only`);
	process.exit(1);
}
const CONFIG = "wrangler.jsonc";

function run(args: string[]): { stdout: string; stderr: string } {
	try {
		const stdout = execFileSync(W, args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 60_000,
		});
		return { stdout, stderr: "" };
	} catch (e) {
		const err = e as SpawnSyncReturns<string> & { stderr?: string; stdout?: string };
		return { stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
	}
}

function extractJsonArray(raw: string): unknown[] {
	const start = raw.indexOf("[");
	const end = raw.lastIndexOf("]");
	if (start === -1 || end === -1) return [];
	return JSON.parse(raw.slice(start, end + 1));
}

console.log(`==> Tearing down: ${NAME}\n`);

// 1. Delete worker
console.log(`--- Deleting worker: ${NAME}`);
const { stdout: wOut, stderr: wErr } = run(["delete", "--name", NAME]);
console.log(`    ${(wOut + wErr).includes("Successfully") ? "done" : "not found / already deleted"}\n`);

// 2. Delete D1
console.log(`--- Deleting D1: ${NAME}-db`);
const { stdout: dOut, stderr: dErr } = run(["d1", "delete", `${NAME}-db`, "-y"]);
console.log(`    ${(dOut + dErr).includes("successfully") ? "done" : "not found / already deleted"}\n`);

// 3. Delete KV (look up ID by title first)
console.log(`--- Deleting KV: ${NAME}-kv`);
// wrangler kv namespace list outputs JSON on stdout (no --json flag exists)
const { stdout: listStdout } = run(["kv", "namespace", "list"]);
const namespaces = extractJsonArray(listStdout) as { title: string; id: string }[];
const kvMatch = namespaces.find((n) => n.title === `${NAME}-kv`);
if (kvMatch) {
	const { stdout: kvOut, stderr: kvErr } = run(["kv", "namespace", "delete", "--namespace-id", kvMatch.id]);
	console.log(`    ${(kvOut + kvErr).includes("Deleted") ? "done" : "failed"}\n`);
} else {
	console.log("    not found / already deleted\n");
}

// 4. Delete Vectorize index
console.log(`--- Deleting Vectorize: ${NAME}-embeddings`);
const { stdout: vecOut, stderr: vecErr } = run(["vectorize", "delete", `${NAME}-embeddings`]);
console.log(`    ${(vecOut + vecErr).includes("Successfully") ? "done" : "not found / already deleted"}\n`);

// 5. Reset wrangler.jsonc to placeholder IDs and restore vectorize (always — keeps git clean)
console.log(`--- Resetting ${CONFIG} to placeholders`);
let cfg = readFileSync(CONFIG, "utf8");
cfg = cfg.replace(/"name":\s*"[^"]+"/, '"name": "lore-mcp"');
cfg = cfg.replace(/"database_name":\s*"[^"]+"/, '"database_name": "lore-mcp-db"');
cfg = cfg.replace(/"database_id":\s*"[^"]+"/, '"database_id": "your-d1-database-id"');
cfg = cfg.replace(/"index_name":\s*"[^"]+"/, '"index_name": "lore-mcp-embeddings"');
cfg = cfg.replace(/"id":\s*"[^"]+"/, '"id": "your-kv-namespace-id"');
// Restore vectorize section if setup stripped it
if (!cfg.includes('"vectorize"')) {
	cfg = cfg.replace(
		/("ai":\s*\{[^}]+\})/,
		'$1,\n\t"vectorize": [\n\t\t{\n\t\t\t"binding": "VECTORIZE_INDEX",\n\t\t\t"index_name": "lore-mcp-embeddings"\n\t\t}\n\t]',
	);
}
writeFileSync(CONFIG, cfg);
console.log("    done\n");

console.log(`==> Teardown complete for: ${NAME}`);
