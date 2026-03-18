/** @implements NFR-001 — Build-hash computation must be deterministic and ignore generated artifacts. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { computeRepoBuildHash } from "./buildHash.js";

function createTempRepo() {
	const dir = join(tmpdir(), `lore-build-hash-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe("scripts/buildHash", () => {
	test("returns a deterministic non-empty hash for the same tree", () => {
		const root = createTempRepo();
		let caught = null;
		try {
			writeFileSync(join(root, "package.json"), '{"name":"x"}\n');
			writeFileSync(join(root, "src.js"), "export const x = 1\n");
			const first = computeRepoBuildHash(root);
			const second = computeRepoBuildHash(root);
			expect(first).toHaveLength(12);
			expect(second).toBe(first);
		} catch (error) {
			caught = error;
		}
		rmSync(root, { recursive: true, force: true });
		if (caught) throw caught;
	});

	test("ignores reports and node_modules when hashing", () => {
		const root = createTempRepo();
		let caught = null;
		try {
			mkdirSync(join(root, "reports"), { recursive: true });
			mkdirSync(join(root, "node_modules"), { recursive: true });
			writeFileSync(join(root, "package.json"), '{"name":"x"}\n');
			const before = computeRepoBuildHash(root);
			writeFileSync(join(root, "reports", "generated.txt"), "changed\n");
			writeFileSync(join(root, "node_modules", "dep.js"), "changed\n");
			const after = computeRepoBuildHash(root);
			expect(after).toBe(before);
		} catch (error) {
			caught = error;
		}
		rmSync(root, { recursive: true, force: true });
		if (caught) throw caught;
	});
});
