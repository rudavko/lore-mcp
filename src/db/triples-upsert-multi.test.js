/** @implements FR-005 — Verify multi-valued predicate upsert behavior for triple writes. */
import { describe, expect, test } from "bun:test";
import { upsertTriple } from "./triples.ops.efct.js";
describe("db/triples upsert multi cardinality", () => {
	test("creates a new triple when predicate is multi and object differs", async () => {
		let createdCalled = false;
		let updatedCalled = false;
		const result = await upsertTriple(
			{
				subject: "S",
				predicate: "tag",
				object: "blue",
				predicate_multi: true,
			},
			{
				findActiveTriples: async () => [
					{
						id: "t-1",
						subject: "S",
						predicate: "tag",
						object: "red",
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						status: "active",
						created_at: "2024-01-01",
					},
				],
				createTriple: async (params) => {
					createdCalled = true;
					return {
						id: "t-2",
						subject: params.subject,
						predicate: params.predicate,
						object: params.object,
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						status: "active",
						created_at: "2024-01-01",
					};
				},
				updateTriple: async () => {
					updatedCalled = true;
					return {
						id: "t-1",
						subject: "S",
						predicate: "tag",
						object: "blue",
						source: null,
						actor: null,
						confidence: null,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						status: "active",
						created_at: "2024-01-01",
					};
				},
			},
		);
		expect(result.created).toBe(true);
		expect(result.triple.id).toBe("t-2");
		expect(createdCalled).toBe(true);
		expect(updatedCalled).toBe(false);
	});
});
