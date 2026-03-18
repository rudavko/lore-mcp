/** @implements NFR-001 — Local mutation harness for fast pure-module regression checks without a permanent dependency. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdout, stderr, exit } from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const MUTANTS = [
	{
		id: "policy-required-op-guard",
		file: "src/domain/policy.pure.js",
		tests: ["src/domain/policy.test.js"],
		find: "if (fields === undefined) {",
		replace: "if (fields !== undefined) {",
	},
	{
		id: "policy-empty-string-required",
		file: "src/domain/policy.pure.js",
		tests: ["src/domain/policy.test.js"],
		find: 'if (value === undefined || value === null || value === "") {',
		replace: "if (value === undefined || value === null) {",
	},
	{
		id: "policy-confidence-undefined-guard",
		file: "src/domain/policy.pure.js",
		tests: ["src/domain/policy.test.js"],
		find: "if (confidence === undefined) {",
		replace: "if (confidence !== undefined) {",
	},
	{
		id: "policy-min-confidence-equality",
		file: "src/domain/policy.pure.js",
		tests: ["src/domain/policy.test.js"],
		find: "if (minConfidence > 0 && confidence < minConfidence) {",
		replace: "if (minConfidence > 0 && confidence <= minConfidence) {",
	},
	{
		id: "validity-undefined-guard",
		file: "src/lib/validity.pure.js",
		tests: ["src/lib/validity.test.js"],
		find: "if (value === undefined) {",
		replace: "if (value !== undefined) {",
	},
	{
		id: "validity-infinite-branch",
		file: "src/lib/validity.pure.js",
		tests: ["src/lib/validity.test.js"],
		find: "if (isInfiniteValidTo(value)) {",
		replace: "if (!isInfiniteValidTo(value)) {",
	},
	{
		id: "validity-fallback-normalization",
		file: "src/lib/validity.pure.js",
		tests: ["src/lib/validity.test.js"],
		find: 'return validTo === null ? "unspecified" : "bounded";',
		replace: 'return validTo === null ? "bounded" : "unspecified";',
	},
	{
		id: "format-text-payload",
		file: "src/lib/format.pure.js",
		tests: ["src/lib/format.test.js"],
		find: "return { content: [{ type: \"text\", text }] };",
		replace: "return { content: [{ type: \"text\", text: \"\" }] };",
	},
	{
		id: "format-error-flag",
		file: "src/lib/format.pure.js",
		tests: ["src/lib/format.test.js"],
		find: "return { content: [{ type: \"text\", text: message }], isError: true };",
		replace: "return { content: [{ type: \"text\", text: message }], isError: false };",
	},
	{
		id: "format-empty-list",
		file: "src/lib/format.pure.js",
		tests: ["src/lib/format.test.js"],
		find: 'if (items.length === 0) return "(none)";',
		replace: 'if (items.length !== 0) return "(none)";',
	},
	{
		id: "format-list-numbering",
		file: "src/lib/format.pure.js",
		tests: ["src/lib/format.test.js"],
		find: "return items.map((item, i) => `${i + 1}. ${item}`).join(\"\\n\");",
		replace: "return items.map((item, i) => `${i}. ${item}`).join(\"\\n\");",
	},
	{
		id: "errors-dependency-retryable",
		file: "src/lib/errors.pure.js",
		tests: ["src/lib/errors.test.js"],
		find: 'return makeError("dependency", message, true);',
		replace: 'return makeError("dependency", message, false);',
	},
	{
		id: "errors-is-err",
		file: "src/lib/errors.pure.js",
		tests: ["src/lib/errors.test.js"],
		find: "return r.ok === false;",
		replace: "return r.ok === true;",
	},
	{
		id: "ulid-random-loop-length",
		file: "src/lib/ulid.pure.js",
		tests: ["src/lib/ulid.test.js"],
		find: "for (let i = 0; i < 16; i++) {",
		replace: "for (let i = 0; i < 15; i++) {",
	},
	{
		id: "ulid-encoding-index",
		file: "src/lib/ulid.pure.js",
		tests: ["src/lib/ulid.test.js"],
		find: "rand += encoding[randomBytes[i] % 32];",
		replace: "rand += encoding[randomBytes[i] % 31];",
	},
	{
		id: "conflict-object-comparison",
		file: "src/domain/conflict.pure.js",
		tests: ["src/domain/conflict.test.js"],
		find: "if (existing[i].object !== incomingObject) {",
		replace: "if (existing[i].object === incomingObject) {",
	},
	{
		id: "conflict-scope-separator",
		file: "src/domain/conflict.pure.js",
		tests: ["src/domain/conflict.test.js"],
		find: 'scope: incoming.subject + "/" + incoming.predicate,',
		replace: 'scope: incoming.subject + ":" + incoming.predicate,',
	},
	{
		id: "conflict-resolution-list",
		file: "src/domain/conflict.pure.js",
		tests: ["src/domain/conflict.test.js"],
		find: 'candidate_resolutions: ["replace", "retain_both", "reject"],',
		replace: 'candidate_resolutions: ["replace", "reject"],',
	},
	{
		id: "ingestion-char-threshold",
		file: "src/domain/ingestion.pure.js",
		tests: ["src/domain/ingestion.test.js"],
		find: "if (content.length > SYNC_THRESHOLD_CHARS) {",
		replace: "if (content.length < SYNC_THRESHOLD_CHARS) {",
	},
	{
		id: "ingestion-chunk-threshold",
		file: "src/domain/ingestion.pure.js",
		tests: ["src/domain/ingestion.test.js"],
		find: "return chunks.length > SYNC_THRESHOLD_ITEMS;",
		replace: "return chunks.length < SYNC_THRESHOLD_ITEMS;",
	},
	{
		id: "ingestion-empty-topic-fallback",
		file: "src/domain/ingestion.pure.js",
		tests: ["src/domain/ingestion.test.js"],
		find: "if (normalized.length === 0) {",
		replace: "if (normalized.length !== 0) {",
	},
	{
		id: "ingestion-low-signal-guard",
		file: "src/domain/ingestion.pure.js",
		tests: ["src/domain/ingestion.test.js"],
		find: "if (candidate.length === 0 || isLowSignalTopic(candidate)) {",
		replace: "if (candidate.length !== 0 || isLowSignalTopic(candidate)) {",
	},
	{
		id: "ingestion-topic-truncation",
		file: "src/domain/ingestion.pure.js",
		tests: ["src/domain/ingestion.test.js"],
		find: "return truncateTopic(candidate, 100);",
		replace: "return candidate;",
	},
	{
		id: "github-parse-slash-count",
		file: "src/domain/github-workflow.pure.js",
		tests: ["src/domain/github-workflow.test.js"],
		find: "if (slashCount !== 1 || slashIndex === 0 || slashIndex === targetRepo.length - 1) {",
		replace: "if (slashCount === 1 || slashIndex === 0 || slashIndex === targetRepo.length - 1) {",
	},
	{
		id: "github-normalize-invalid-repo",
		file: "src/domain/github-workflow.pure.js",
		tests: ["src/domain/github-workflow.test.js"],
		find: "if (parsed.error !== null) {",
		replace: "if (parsed.error === null) {",
	},
	{
		id: "github-stable-minute-modulus",
		file: "src/domain/github-workflow.pure.js",
		tests: ["src/domain/github-workflow.test.js"],
		find: "return hash % 60;",
		replace: "return hash % 59;",
	},
	{
		id: "github-workflow-name",
		file: "src/domain/github-workflow.pure.js",
		tests: ["src/domain/github-workflow.test.js"],
		find: "'name: Upstream Sync\\n\\non:\\n  schedule:\\n    - cron: \"' +",
		replace: "'name: Downstream Sync\\n\\non:\\n  schedule:\\n    - cron: \"' +",
	},
	{
		id: "schedule-delay-constant",
		file: "src/wiring/schedule.pure.js",
		tests: ["src/wiring/schedule.test.js"],
		find: "export const RESCHEDULE_DELAY_MS = 1000;",
		replace: "export const RESCHEDULE_DELAY_MS = 0;",
	},
	{
		id: "schedule-reschedule-threshold",
		file: "src/wiring/schedule.pure.js",
		tests: ["src/wiring/schedule.test.js"],
		find: "export const shouldReschedule = (remaining) => remaining > 0;",
		replace: "export const shouldReschedule = (remaining) => remaining >= 0;",
	},
];

function normalizePath(relativePath) {
	return join(ROOT_DIR, relativePath);
}

function countOccurrences(sourceText, searchText) {
	if (searchText.length === 0) {
		return 0;
	}
	let count = 0;
	let startIndex = 0;
	while (startIndex <= sourceText.length) {
		const nextIndex = sourceText.indexOf(searchText, startIndex);
		if (nextIndex === -1) {
			break;
		}
		count++;
		startIndex = nextIndex + searchText.length;
	}
	return count;
}

function ensureSingleMatch(mutant, sourceText) {
	const occurrenceCount = countOccurrences(sourceText, mutant.find);
	if (occurrenceCount !== 1) {
		throw new Error(
			"Mutation target " +
				mutant.id +
				" expected exactly 1 match in " +
				mutant.file +
				", found " +
				String(occurrenceCount),
		);
	}
}

function runTests(testFiles) {
	return spawnSync("bun", ["test", ...testFiles], {
		cwd: ROOT_DIR,
		encoding: "utf8",
		stdio: "pipe",
	});
}

function writeLine(text) {
	stdout.write(text + "\n");
}

function writeErrorLine(text) {
	stderr.write(text + "\n");
}

function uniqueTestFiles(mutants) {
	const unique = [];
	for (let i = 0; i < mutants.length; i++) {
		const tests = mutants[i].tests;
		for (let j = 0; j < tests.length; j++) {
			if (!unique.includes(tests[j])) {
				unique.push(tests[j]);
			}
		}
	}
	return unique;
}

function previewFailure(result) {
	const combined = (result.stdout || "") + (result.stderr || "");
	const trimmed = combined.trim();
	if (trimmed.length === 0) {
		return "(no output)";
	}
	const lines = trimmed.split("\n");
	const previewLines = lines.slice(-8);
	return previewLines.join("\n");
}

function applyMutant(mutant, sourceText) {
	return sourceText.replace(mutant.find, mutant.replace);
}

function main() {
	const baselineTests = uniqueTestFiles(MUTANTS);
	writeLine("Running baseline mutation target tests");
	const baseline = runTests(baselineTests);
	if (baseline.status !== 0) {
		writeErrorLine("Baseline tests failed. Mutation run aborted.");
		writeErrorLine(previewFailure(baseline));
		exit(1);
	}

	let killedCount = 0;
	const survivors = [];

	for (let i = 0; i < MUTANTS.length; i++) {
		const mutant = MUTANTS[i];
		const filePath = normalizePath(mutant.file);
		const originalText = readFileSync(filePath, "utf8");
		ensureSingleMatch(mutant, originalText);
		const mutatedText = applyMutant(mutant, originalText);
		writeFileSync(filePath, mutatedText, "utf8");
		try {
			const result = runTests(mutant.tests);
			if (result.status === 0) {
				survivors.push({
					id: mutant.id,
					file: mutant.file,
					preview: previewFailure(result),
				});
				writeLine("SURVIVED " + mutant.id + " [" + mutant.file + "]");
			} else {
				killedCount++;
				writeLine("KILLED   " + mutant.id + " [" + mutant.file + "]");
			}
		} finally {
			writeFileSync(filePath, originalText, "utf8");
		}
	}

	writeLine("");
	writeLine("Mutation summary");
	writeLine("Killed: " + String(killedCount));
	writeLine("Survived: " + String(survivors.length));
	writeLine("Total: " + String(MUTANTS.length));

	if (survivors.length > 0) {
		writeErrorLine("");
		writeErrorLine("Surviving mutants");
		for (let i = 0; i < survivors.length; i++) {
			writeErrorLine(
				"- " +
					survivors[i].id +
					" [" +
					survivors[i].file +
					"]\n" +
					survivors[i].preview,
			);
		}
		exit(1);
	}
}

main();
