// GEMINI-CONTEXT: Dev-only setup script for provisioning CF resources.
// Runs under Node (not Bun) via --experimental-strip-types because Bun.spawnSync
// and execFileSync under Bun both hang when piping wrangler's stdout.
// Uses Node's execFileSync which handles pipe buffering correctly.
// NAME validated to [a-z0-9-] — safe for interpolation.
// stdout/stderr kept separate — JSON parsing only uses stdout.
//
// Vectorize index_name is updated but NOT provisioned — Vectorize is optional
// and not supported by CF's deploy button. Deploy succeeds without it.
//
// Regex patterns verified against wrangler 4.64 output:
//   - d1 create stdout: {"d1_databases":[{"database_id":"uuid",...}]}
//   - kv namespace create stdout: {"kv_namespaces":[{"id":"hex",...}]}
//   - d1 list --json stdout: [{"uuid":"...","name":"...", ...}]
//   - kv namespace list stdout: [{"id":"...","title":"...", ...}]

/**
 * Provisions all Cloudflare resources for a given deployment name,
 * updates wrangler.jsonc with real IDs, sets secrets, and deploys.
 *
 * Usage:
 *   npm run setup                     # deploy as "lore-mcp" (default)
 *   npm run setup -- lore-test-deploy # deploy with namespaced resources
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

function patchConfig(replacements: [RegExp, string][]) {
	let cfg = readFileSync(CONFIG, "utf8");
	for (const [pattern, value] of replacements) {
		cfg = cfg.replace(pattern, value);
	}
	writeFileSync(CONFIG, cfg);
}

interface RunResult {
	stdout: string;
	stderr: string;
	ok: boolean;
}

function run(args: string[], opts?: { input?: string }): RunResult {
	try {
		const stdout = execFileSync(W, args, {
			encoding: "utf8",
			input: opts?.input,
			stdio: [opts?.input ? "pipe" : "ignore", "pipe", "pipe"],
			timeout: 60_000,
		});
		return { stdout, stderr: "", ok: true };
	} catch (e) {
		const err = e as SpawnSyncReturns<string> & { stderr?: string; stdout?: string };
		return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", ok: false };
	}
}

function extractJsonArray(raw: string): unknown[] {
	const start = raw.indexOf("[");
	const end = raw.lastIndexOf("]");
	if (start === -1 || end === -1) throw new Error(`No JSON array in output:\n${raw}`);
	return JSON.parse(raw.slice(start, end + 1));
}

function getD1Id(dbName: string): string {
	const { stdout, stderr } = run(["d1", "create", dbName]);
	const combined = stdout + stderr;

	if (!combined.includes("already exists") && stdout.includes("database_id")) {
		const m = stdout.match(/"database_id":\s*"([^"]+)"/);
		if (m) return m[1];
	}

	console.log(`    D1 '${dbName}' already exists, fetching ID...`);
	const list = run(["d1", "list", "--json"]);
	if (!list.ok) throw new Error(`d1 list failed:\nstdout: ${list.stdout}\nstderr: ${list.stderr}`);
	const databases = extractJsonArray(list.stdout) as { name: string; uuid: string }[];
	const match = databases.find((d) => d.name === dbName);
	if (!match) throw new Error(`D1 '${dbName}' not found in list`);
	return match.uuid;
}

function getKvId(title: string): string {
	const { stdout, stderr } = run(["kv", "namespace", "create", title]);
	const combined = stdout + stderr;

	if (!combined.includes("already exists") && stdout.includes('"id"')) {
		const m = stdout.match(/"id":\s*"([^"]+)"/);
		if (m) return m[1];
	}

	// wrangler kv namespace list has no --json flag; outputs JSON on stdout by default
	console.log(`    KV '${title}' already exists, fetching ID...`);
	const list = run(["kv", "namespace", "list"]);
	if (!list.ok) throw new Error(`kv list failed:\nstdout: ${list.stdout}\nstderr: ${list.stderr}`);
	const namespaces = extractJsonArray(list.stdout) as { title: string; id: string }[];
	const match = namespaces.find((n) => n.title === title);
	if (!match) throw new Error(`KV '${title}' not found in list`);
	return match.id;
}

// ── Main ──────────────────────────────────────────────────────────────

console.log(`==> Deploying as: ${NAME}`);

// 1. Patch wrangler.jsonc with namespaced resource names
patchConfig([
	[/"name":\s*"[^"]+"/, `"name": "${NAME}"`],
	[/"database_name":\s*"[^"]+"/, `"database_name": "${NAME}-db"`],
	[/"index_name":\s*"[^"]+"/, `"index_name": "${NAME}-embeddings"`],
]);
console.log(`    Updated ${CONFIG} (name=${NAME}, db=${NAME}-db, vectorize=${NAME}-embeddings)`);

// 2. Create D1 database
console.log(`==> Creating D1 database: ${NAME}-db`);
const d1Id = getD1Id(`${NAME}-db`);
console.log(`    D1 ID: ${d1Id}`);
patchConfig([[/"database_id":\s*"[^"]+"/, `"database_id": "${d1Id}"`]]);

// 3. Create KV namespace
console.log(`==> Creating KV namespace: ${NAME}-kv`);
const kvId = getKvId(`${NAME}-kv`);
console.log(`    KV ID: ${kvId}`);
patchConfig([[/"id":\s*"[^"]+"/, `"id": "${kvId}"`]]);

// 4. Secrets
console.log(`==> Setting secrets for ${NAME}`);
try {
	const devVarsContent = readFileSync(".dev.vars", "utf8");
	console.log("    Reading from .dev.vars");
	for (const line of devVarsContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx);
		const value = trimmed.slice(eqIdx + 1);
		if (!value) {
			console.log(`    Skipping ${key} (empty)`);
			continue;
		}
		const { stdout, stderr, ok } = run(["secret", "put", key, "--name", NAME], { input: value + "\n" });
		const success = (stdout + stderr).includes("Success");
		console.log(`    ${key}: ${success ? "set" : `FAILED — ${(stderr || stdout).trim().split("\n").pop()}`}`);
	}
} catch {
	console.log("    No .dev.vars found. Set secrets manually:");
	console.log(`    echo "VALUE" | npx wrangler secret put ACCESS_PASSPHRASE --name ${NAME}`);
	console.log(`    echo "VALUE" | npx wrangler secret put OWNER_EMAIL --name ${NAME}`);
}

// 5. Create Vectorize index (bge-base-en-v1.5 = 768 dimensions, cosine similarity)
console.log(`==> Creating Vectorize index: ${NAME}-embeddings`);
const vecResult = run(["vectorize", "create", `${NAME}-embeddings`, "--dimensions", "768", "--metric", "cosine"]);
const vecCombined = vecResult.stdout + vecResult.stderr;
if (vecCombined.includes("already exists")) {
	console.log(`    Vectorize '${NAME}-embeddings' already exists`);
} else if (vecResult.ok) {
	console.log(`    Created`);
} else {
	console.log(`    FAILED — ${vecCombined.trim().split("\n").pop()}`);
	console.log("    Deploying without Vectorize (semantic search will be disabled)");
	let cfg = readFileSync(CONFIG, "utf8");
	cfg = cfg.replace(/,?\s*"vectorize":\s*\[[\s\S]*?\]/, "");
	writeFileSync(CONFIG, cfg);
}

// 6. Migrations + deploy (inherit stdio for progress output)
console.log("==> Applying D1 migrations");
execFileSync(W, ["d1", "migrations", "apply", "DB", "--remote"], { stdio: "inherit", timeout: 180_000 });

console.log(`==> Deploying worker: ${NAME}`);
execFileSync(W, ["deploy"], { stdio: "inherit", timeout: 180_000 });

console.log(`\n==> Done! Deployed: ${NAME}`);
console.log(`    URL: https://${NAME}.workers.dev`);
