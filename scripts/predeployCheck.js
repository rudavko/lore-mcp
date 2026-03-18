/**
 * Fails fast when wrangler.jsonc still contains placeholder resource IDs.
 */

import { readFileSync } from "node:fs";

const CONFIG_PATH = "wrangler.jsonc";
const PLACEHOLDER_TOKENS = [
	'"id": "your-kv-namespace-id"',
	'"database_id": "your-d1-database-id"',
];

function main() {
	const configText = readFileSync(CONFIG_PATH, "utf8");
	const found = PLACEHOLDER_TOKENS.filter((token) => configText.includes(token));

	if (found.length === 0) {
		console.log("predeploy-check: wrangler.jsonc contains concrete resource IDs");
		return;
	}

	console.error("predeploy-check: unresolved placeholder IDs found in wrangler.jsonc");
	for (const token of found) {
		console.error(`- ${token}`);
	}
	console.error("Set real IDs first, or run: bun run setup -- <deployment-name>");
	process.exit(1);
}

main();
