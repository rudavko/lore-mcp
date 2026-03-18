/** @implements FR-006 — Verify conflict detection pure logic and conflict payload shaping. */
import { describe, test, expect } from "bun:test";
import { _MODULE, findConflictingTriple, buildConflictInfo } from "./conflict.pure.js";
describe("domain/conflict.pure", () => {
	const makeTriple = (object) => ({
		id: "t_01",
		subject: "Bun",
		predicate: "version",
		object,
		source: null,
		actor: null,
		confidence: null,
		valid_from: null,
		valid_to: null,
		valid_to_state: "unspecified",
		status: "active",
		created_at: "2025-01-01T00:00:00Z",
	});

	test("exports the expected module sentinel", () => {
		expect(_MODULE).toBe("conflict.pure");
	});

	describe("findConflictingTriple", () => {
		test("returns null for empty list", () => {
			expect(findConflictingTriple([], "1.0")).toBeNull();
		});
		test("returns null when all objects match", () => {
			const triples = [makeTriple("1.0"), makeTriple("1.0")];
			expect(findConflictingTriple(triples, "1.0")).toBeNull();
		});
		test("returns first conflicting triple", () => {
			const triples = [makeTriple("0.9"), makeTriple("1.0")];
			const result = findConflictingTriple(triples, "1.0");
			expect(result).not.toBeNull();
			expect(result.object).toBe("0.9");
		});
	});
	describe("buildConflictInfo", () => {
		test("builds ConflictInfo with all fields", () => {
			const existing = makeTriple("0.9");
			const info = buildConflictInfo("ulid_01", existing, {
				subject: "Bun",
				predicate: "version",
				object: "1.0",
				confidence: 0.9,
				source: "docs",
				actor: "bot",
			});
			expect(info.conflict_id).toBe("ulid_01");
			expect(info.scope).toBe("Bun/version");
			expect(info.existing.id).toBe("t_01");
			expect(info.incoming.object).toBe("1.0");
			expect(info.incoming.confidence).toBe(0.9);
			expect(info.candidate_resolutions.length).toBe(3);
			expect(info.candidate_resolutions).toEqual(["replace", "retain_both", "reject"]);
		});
		test("handles null optional fields", () => {
			const existing = makeTriple("old");
			const info = buildConflictInfo("ulid_02", existing, {
				subject: "X",
				predicate: "Y",
				object: "new",
			});
			expect(info.incoming.confidence).toBeUndefined();
			expect(info.incoming.source).toBeUndefined();
			expect(info.incoming.actor).toBeUndefined();
		});
	});
});
