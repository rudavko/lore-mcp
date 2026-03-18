/** @implements NFR-001 — Verify triple pure helpers: validation, row mapping, query building. */
import { describe, test, expect } from "bun:test";
import {
	validateTripleFields,
	rowToTriple,
	buildTripleObject,
	buildTripleQueryConditions,
} from "./triples.pure.js";
describe("triple validation", () => {
	test("valid params return ok", () => {
		const r = validateTripleFields({ subject: "A", predicate: "knows", object: "B" });
		expect(r.ok).toBe(true);
	});
	test("subject too long returns error", () => {
		const r = validateTripleFields({ subject: "x".repeat(2001) });
		expect(r.ok).toBe(false);
	});
	test("invalid validity interval value returns error", () => {
		const r = validateTripleFields({
			subject: "A",
			predicate: "knows",
			object: "B",
			valid_to: "bad-date",
		});
		expect(r.ok).toBe(false);
	});
	test("null validity interval values are accepted for patch operations", () => {
		const r = validateTripleFields({ valid_from: null, valid_to: null });
		expect(r.ok).toBe(true);
	});
	test("valid_to supports infinite sentinel", () => {
		const r = validateTripleFields({
			subject: "A",
			predicate: "knows",
			object: "B",
			valid_to: "infinite",
		});
		expect(r.ok).toBe(true);
	});
});
describe("rowToTriple", () => {
	test("maps DB row to Triple", () => {
		const row = {
			id: "1",
			subject: "A",
			predicate: "knows",
			object: "B",
			source: null,
			actor: null,
			confidence: null,
			valid_from: null,
			valid_to: null,
			valid_to_state: "unspecified",
			status: "active",
			created_at: "2024-01-01",
		};
		const triple = rowToTriple(row);
		expect(triple.subject).toBe("A");
		expect(triple.predicate).toBe("knows");
		expect(triple.valid_to_state).toBe("unspecified");
	});
});
describe("buildTripleObject", () => {
	test("creates Triple with defaults", () => {
		const t = buildTripleObject(
			"id1",
			{ subject: "A", predicate: "is", object: "B" },
			"2024-01-01",
		);
		expect(t.id).toBe("id1");
		expect(t.status).toBe("active");
	});
	test("uses provided validity fields", () => {
		const t = buildTripleObject(
			"id1",
			{
				subject: "A",
				predicate: "is",
				object: "B",
				valid_from: "2025-01-01T00:00:00.000Z",
				valid_to: "2025-12-31T00:00:00.000Z",
			},
			"2024-01-01",
		);
		expect(t.valid_from).toBe("2025-01-01T00:00:00.000Z");
		expect(t.valid_to).toBe("2025-12-31T00:00:00.000Z");
	});
	test("normalizes valid_to=infinite to open-ended null", () => {
		const t = buildTripleObject(
			"id1",
			{
				subject: "A",
				predicate: "is",
				object: "B",
				valid_to: "infinite",
			},
			"2024-01-01",
		);
		expect(t.valid_to).toBeNull();
		expect(t.valid_to_state).toBe("infinite");
	});
	test("omitted valid_to is stored as unspecified", () => {
		const t = buildTripleObject(
			"id1",
			{ subject: "A", predicate: "is", object: "B" },
			"2024-01-01",
		);
		expect(t.valid_to).toBeNull();
		expect(t.valid_to_state).toBe("unspecified");
	});
});
describe("buildTripleQueryConditions", () => {
	test("base condition always present", () => {
		const { conditions } = buildTripleQueryConditions({}, null);
		expect(conditions).toContain("deleted_at IS NULL");
	});
	test("subject filter adds exact match", () => {
		const { conditions, binds } = buildTripleQueryConditions({ subject: "A" }, null);
		expect(conditions).toContain("subject = ?");
		expect(binds).toContain("A");
	});
});
