import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function ensurePatchedFile(relativePath, applyPatch) {
	const absolutePath = join(ROOT_DIR, relativePath);
	const current = readFileSync(absolutePath, "utf8");
	const next = applyPatch(current);
	if (next !== current) {
		writeFileSync(absolutePath, next);
	}
}

function patchMutantFile(source) {
	if (source.includes("const generator = generate.default || generate;")) {
		return source;
	}
	return source.replace(
		"const generator = generate.default;",
		"const generator = generate.default || generate;",
	);
}

function patchJsPrinter(source) {
	if (source.includes("const generate = generator.default || generator;")) {
		return source;
	}
	return source.replace(
		"import generator from '@babel/generator';\nexport const print = (file) => {\n    return generator.default(file.root, { sourceMaps: false }).code;\n};",
		"import generator from '@babel/generator';\nconst generate = generator.default || generator;\nexport const print = (file) => {\n    return generate(file.root, { sourceMaps: false }).code;\n};",
	);
}

function patchTsPrinter(source) {
	if (source.includes("const generate = generator.default || generator;")) {
		return source;
	}
	return source.replace(
		"import generator from '@babel/generator';\nexport const print = (file) => {\n    return generator.default(file.root, {\n        decoratorsBeforeExport: true,\n        sourceMaps: false,\n    }).code;\n};",
		"import generator from '@babel/generator';\nconst generate = generator.default || generator;\nexport const print = (file) => {\n    return generate(file.root, {\n        decoratorsBeforeExport: true,\n        sourceMaps: false,\n    }).code;\n};",
	);
}

ensurePatchedFile(
	"node_modules/@stryker-mutator/instrumenter/dist/src/mutant.js",
	patchMutantFile,
);
ensurePatchedFile(
	"node_modules/@stryker-mutator/instrumenter/dist/src/printers/js-printer.js",
	patchJsPrinter,
);
ensurePatchedFile(
	"node_modules/@stryker-mutator/instrumenter/dist/src/printers/ts-printer.js",
	patchTsPrinter,
);

const result = spawnSync(
	"bun",
	["./node_modules/@stryker-mutator/core/bin/stryker.js", "run", ...process.argv.slice(2)],
	{
		cwd: ROOT_DIR,
		stdio: "inherit",
	},
);

exit(result.status ?? 1);
