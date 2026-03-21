/** @implements FR-006 — Verify conflict detection orchestration queries active triples and builds conflict records only when needed. */
import { describe, expect, test } from "bun:test";
import { detectConflict } from "./conflict.ops.efct.js";

describe("domain/conflict.ops.efct", () => {
	test("returns null when no existing triples are found", async () => {
		let unexpectedConflictLookup = false;
		let unexpectedConflictBuild = false;
		const result = await detectConflict(
			{ subject: "S", predicate: "P", incomingObject: "O" },
			{
				findActiveTriples: async () => [],
				findConflictingTriple: () => {
					unexpectedConflictLookup = true;
					return { id: "unexpected" };
				},
				buildConflictInfo: () => {
					unexpectedConflictBuild = true;
					return { id: "unexpected" };
				},
			},
		);

		expect(result).toBeNull();
		expect(unexpectedConflictLookup).toBe(false);
		expect(unexpectedConflictBuild).toBe(false);
	});

	test("returns null when existing triples are compatible", async () => {
		let unexpectedConflictBuild = false;
		const result = await detectConflict(
			{ subject: "S", predicate: "P", incomingObject: "O" },
			{
				findActiveTriples: async () => [{ id: "t-1" }],
				findConflictingTriple: () => null,
				buildConflictInfo: () => {
					unexpectedConflictBuild = true;
					return { id: "unexpected" };
				},
			},
		);

		expect(result).toBeNull();
		expect(unexpectedConflictBuild).toBe(false);
	});

	test("builds a conflict record with undefined optional fields when nullish inputs are absent", async () => {
		const result = await detectConflict(
			{
				subject: "S",
				predicate: "P",
				incomingObject: "O",
				incomingConfidence: null,
				incomingSource: null,
				incomingActor: null,
			},
			{
				findActiveTriples: async () => [{ id: "t-1" }],
				findConflictingTriple: (existing, object) => ({ existing, object, id: "conflicting" }),
				generateId: () => "conflict-1",
				buildConflictInfo: (id, conflicting, incoming) => ({
					id,
					conflicting,
					incoming,
				}),
			},
		);

		expect(result).toEqual({
			id: "conflict-1",
			conflicting: {
				existing: [{ id: "t-1" }],
				object: "O",
				id: "conflicting",
			},
			incoming: {
				subject: "S",
				predicate: "P",
				object: "O",
				confidence: undefined,
				source: undefined,
				actor: undefined,
				valid_from: undefined,
				valid_to: undefined,
			},
		});
	});

	test("preserves incoming validity bounds for downstream conflict resolution", async () => {
		const result = await detectConflict(
			{
				subject: "S",
				predicate: "P",
				incomingObject: "O",
				incomingValidFrom: "2026-01-01T00:00:00.000Z",
				incomingValidTo: "2026-12-31T00:00:00.000Z",
				incomingConfidence: 0,
			},
			{
				findActiveTriples: async () => [{ id: "t-1" }],
				findConflictingTriple: () => ({ id: "conflicting" }),
				generateId: () => "conflict-2",
				buildConflictInfo: (_id, _conflicting, incoming) => incoming,
			},
		);

		expect(result).toEqual({
			subject: "S",
			predicate: "P",
			object: "O",
			confidence: 0,
			source: undefined,
			actor: undefined,
			valid_from: "2026-01-01T00:00:00.000Z",
			valid_to: "2026-12-31T00:00:00.000Z",
		});
	});
});
