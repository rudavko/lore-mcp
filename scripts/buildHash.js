import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(__dirname, "..")
const IGNORED_PREFIXES = [
	".git",
	"node_modules",
	".wrangler",
	"reports",
	".stryker-tmp",
	".stryker-system-tmp",
];

function shouldIgnore(relPath) {
	for (let i = 0; i < IGNORED_PREFIXES.length; i++) {
		if (relPath === IGNORED_PREFIXES[i] || relPath.startsWith(IGNORED_PREFIXES[i] + "/")) {
			return true;
		}
	}
	return false;
}

function listFilesRecursively(dir, baseDir, acc) {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const fullPath = resolve(dir, entry.name);
		const relPath = relative(baseDir, fullPath).replaceAll("\\", "/");
		if (shouldIgnore(relPath)) {
			continue;
		}
		if (entry.isDirectory()) {
			listFilesRecursively(fullPath, baseDir, acc);
			continue;
		}
		if (entry.isFile()) {
			acc.push(relPath);
		}
	}
}

export function computeRepoBuildHash(rootDir = DEFAULT_ROOT) {
	const filePaths = [];
	listFilesRecursively(rootDir, rootDir, filePaths);
	filePaths.sort((left, right) => left.localeCompare(right));
	const hash = createHash("sha256");
	for (let i = 0; i < filePaths.length; i++) {
		const relPath = filePaths[i];
		hash.update(relPath);
		hash.update("\n");
		hash.update(readFileSync(resolve(rootDir, relPath)));
		hash.update("\n");
	}
	return hash.digest("hex").slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	console.log(computeRepoBuildHash());
}
