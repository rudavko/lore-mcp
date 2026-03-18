/** @implements NFR-001 — Verify conflict pure helpers: validation of ConflictInfo shape. */
import { describe, test, expect } from "bun:test";
import { toConflictInfo, DEFAULT_CONFLICT_TTL_MS } from "./conflicts.pure.js";
describe("toConflictInfo", () => {
	const validConflict = {
		conflict_id: "c1",
		scope: "subject+predicate",
		existing: {
			id: "t1",
			subject: "A",
			predicate: "knows",
			object: "B",
			source: null,
			actor: null,
			confidence: null,
			valid_from: null,
			valid_to: null,
			status: "active",
			created_at: "2024-01-01",
		},
		incoming: { subject: "A", predicate: "knows", object: "C" },
		candidate_resolutions: ["replace", "retain_both", "reject"],
	};
	test("returns ConflictInfo for valid input", () => {
		const result = toConflictInfo(validConflict);
		expect(result).not.toBeNull();
		expect(result.conflict_id).toBe("c1");
		expect(result.scope).toBe("subject+predicate");
	});
	test("returns null for null input", () => {
		expect(toConflictInfo(null)).toBeNull();
	});
	test("returns null for non-object input", () => {
		expect(toConflictInfo("string")).toBeNull();
	});
	test("returns null for missing conflict_id", () => {
		const input = { ...validConflict, conflict_id: undefined };
		expect(toConflictInfo(input)).toBeNull();
	});
	test("returns null for non-string scope", () => {
		const input = { ...validConflict, scope: 42 };
		expect(toConflictInfo(input)).toBeNull();
	});
	test("returns null for missing existing", () => {
		const input = { ...validConflict, existing: undefined };
		expect(toConflictInfo(input)).toBeNull();
	});
	test("returns null for missing incoming", () => {
		const input = { ...validConflict, incoming: undefined };
		expect(toConflictInfo(input)).toBeNull();
	});
	test("returns null for non-array candidate_resolutions", () => {
		const input = { ...validConflict, candidate_resolutions: "not-array" };
		expect(toConflictInfo(input)).toBeNull();
	});
});
describe("DEFAULT_CONFLICT_TTL_MS", () => {
	test("is 1 hour in milliseconds", () => {
		expect(DEFAULT_CONFLICT_TTL_MS).toBe(3600000);
	});
});
