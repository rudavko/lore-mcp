import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = "src";

async function listFilesRecursive(dirPath) {
	const dirents = await readdir(dirPath, { withFileTypes: true });
	const files = [];
	for (let i = 0; i < dirents.length; i++) {
		const dirent = dirents[i];
		if (dirent.name.startsWith(".")) {
			continue;
		}
		const fullPath = path.join(dirPath, dirent.name);
		if (dirent.isDirectory()) {
			const nested = await listFilesRecursive(fullPath);
			for (let j = 0; j < nested.length; j++) {
				files.push(nested[j]);
			}
			continue;
		}
		if (dirent.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function countLines(content) {
	if (content.length === 0) {
		return 0;
	}
	return content.split("\n").length;
}

function toRelativeRepoPath(fullPath) {
	return path.relative(ROOT_DIR, fullPath).split(path.sep).join("/");
}

function sortRows(rows) {
	rows.sort((left, right) => {
		if (right.loc !== left.loc) {
			return right.loc - left.loc;
		}
		return left.path.localeCompare(right.path);
	});
	return rows;
}

async function buildLocRows(targetDir) {
	const fullTargetDir = path.join(ROOT_DIR, targetDir);
	const files = await listFilesRecursive(fullTargetDir);
	const rows = [];
	for (let i = 0; i < files.length; i++) {
		const content = await readFile(files[i], "utf8");
		rows.push({
			loc: countLines(content),
			path: toRelativeRepoPath(files[i]),
		});
	}
	return sortRows(rows);
}

function formatTsv(rows) {
	const lines = ["loc\tpath"];
	for (let i = 0; i < rows.length; i++) {
		lines.push(String(rows[i].loc) + "\t" + rows[i].path);
	}
	return lines.join("\n") + "\n";
}

async function main() {
	const targetDir = process.argv[2] || DEFAULT_TARGET;
	const reportBase = targetDir.replaceAll("/", "-");
	const reportDir = path.join(ROOT_DIR, "reports");
	const reportPath = path.join(reportDir, reportBase + "-file-loc-desc.tsv");
	const rows = await buildLocRows(targetDir);
	const tsv = formatTsv(rows);
	await mkdir(reportDir, { recursive: true });
	await writeFile(reportPath, tsv, "utf8");
	process.stdout.write(tsv);
	process.stderr.write("Wrote " + reportPath + "\n");
}

main().catch((error) => {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	process.stderr.write(message + "\n");
	process.exitCode = 1;
});
