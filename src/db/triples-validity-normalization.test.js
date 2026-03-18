/** @implements FR-014 — Verify triple update validity normalization semantics. */
import { describe, expect, test } from "bun:test";
import { updateTriple } from "./triples.ops.efct.js";
const deriveValidToStateFromInput = (value) => {
	if (value === undefined) {
		return { validTo: undefined, validToState: "unspecified" };
	}
	if (value === null) {
		return { validTo: null, validToState: "unspecified" };
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "infinite" || normalized === "infinity" || normalized === "forever") {
		return { validTo: null, validToState: "infinite" };
	}
	return { validTo: value, validToState: "bounded" };
};
describe("db/triples.ops validity normalization", () => {
	test("updateTriple normalizes valid_to=infinite to null", async () => {
		const triple = await updateTriple(
			"t-1",
			{ valid_to: "infinite" },
			{
				fetchExistingTriple: async () => ({
					id: "t-1",
					subject: "S",
					predicate: "p",
					object: "o",
					source: null,
					actor: null,
					confidence: null,
					valid_from: "2024-01-01T00:00:00.000Z",
					valid_to: "2024-12-31T00:00:00.000Z",
					valid_to_state: "bounded",
					status: "active",
					created_at: "2024-01-01T00:00:00.000Z",
				}),
				updateTripleRow: async () => {},
				validateTripleFields: () => ({ ok: true }),
				deriveValidToStateFromInput,
				generateId: () => "tx-1",
				now: () => "2024-01-02T00:00:00.000Z",
				serialize: JSON.stringify,
				db: {},
				throwValidation: (_message) => undefined,
			},
		);
		expect(triple.valid_to).toBeNull();
		expect(triple.valid_to_state).toBe("infinite");
	});
});
