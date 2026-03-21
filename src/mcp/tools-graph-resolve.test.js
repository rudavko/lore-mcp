/** @implements FR-006 — Verify resolve_conflict preserves the full incoming triple payload. */
import { describe, expect, test } from "bun:test";
import { handleResolveReplace, handleResolveRetain } from "./tools-graph-resolve.efct.js";
import { withGraphHandlerDeps } from "./tools-handler.test-helpers.js";

describe("mcp/tools.efct resolve_conflict", () => {
	test("replace forwards confidence=0 and validity bounds to updateTriple", async () => {
		let received = null;
		const result = await handleResolveReplace(
			{
				conflict_id: "c-1",
				strategy: "replace",
				conflict: {
					existing: { id: "t-1" },
					incoming: {
						object: "new",
						confidence: 0,
						source: "docs",
						actor: "agent",
						valid_from: "2026-01-01T00:00:00.000Z",
						valid_to: "2026-12-31T00:00:00.000Z",
					},
				},
			},
			withGraphHandlerDeps({
				removeConflict: async () => {},
				updateTriple: async (_id, patch) => {
					received = patch;
					return {
						id: "t-1",
						subject: "S",
						predicate: "P",
						object: patch.object,
						source: patch.source,
						actor: patch.actor,
						confidence: patch.confidence,
						valid_from: patch.valid_from,
						valid_to: patch.valid_to,
						valid_to_state: "bounded",
					};
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);

		expect(received).toEqual({
			object: "new",
			source: "docs",
			actor: "agent",
			confidence: 0,
			valid_from: "2026-01-01T00:00:00.000Z",
			valid_to: "2026-12-31T00:00:00.000Z",
		});
		expect(result.triple.confidence).toBe(0);
		expect(result.triple.valid_from).toBe("2026-01-01T00:00:00.000Z");
		expect(result.triple.valid_to).toBe("2026-12-31T00:00:00.000Z");
		expect(result.triple.valid_to_state).toBe("bounded");
	});

	test("retain_both forwards confidence=0 and validity bounds to createTriple", async () => {
		let received = null;
		const result = await handleResolveRetain(
			{
				conflict_id: "c-2",
				strategy: "retain_both",
				conflict: {
					incoming: {
						subject: "S",
						predicate: "P",
						object: "new",
						confidence: 0,
						source: "docs",
						actor: "agent",
						valid_from: "2026-01-01T00:00:00.000Z",
						valid_to: "2026-12-31T00:00:00.000Z",
					},
				},
			},
			withGraphHandlerDeps({
				removeConflict: async () => {},
				createTriple: async (triple) => {
					received = triple;
					return {
						id: "t-2",
						...triple,
						valid_to_state: "bounded",
					};
				},
				notifyResourceChange: () => {},
				formatResult: (_text, data) => data,
			}),
		);

		expect(received).toEqual({
			subject: "S",
			predicate: "P",
			object: "new",
			source: "docs",
			actor: "agent",
			confidence: 0,
			valid_from: "2026-01-01T00:00:00.000Z",
			valid_to: "2026-12-31T00:00:00.000Z",
		});
		expect(result.triple.confidence).toBe(0);
		expect(result.triple.valid_from).toBe("2026-01-01T00:00:00.000Z");
		expect(result.triple.valid_to).toBe("2026-12-31T00:00:00.000Z");
		expect(result.triple.valid_to_state).toBe("bounded");
	});
});
