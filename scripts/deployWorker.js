import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { computeRepoBuildHash } from "./buildHash.js";
import { resolveTargetRepo } from "./targetRepo.js";

const wrangler = "./node_modules/.bin/wrangler";

function runWrangler(args) {
	execFileSync(wrangler, args, {
		stdio: "inherit",
		env: process.env,
	});
}

export function buildDeployArgs(targetRepo, buildHash, extraArgs) {
	return [
		"deploy",
		"--var",
		`TARGET_REPO:${targetRepo}`,
		"--var",
		`BUILD_HASH:${buildHash}`,
		...extraArgs,
	];
}

function main(argv) {
	const targetRepo = resolveTargetRepo();
	const buildHash = computeRepoBuildHash();
	runWrangler(["d1", "migrations", "apply", "DB", "--remote"]);
	runWrangler(buildDeployArgs(targetRepo, buildHash, argv));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
