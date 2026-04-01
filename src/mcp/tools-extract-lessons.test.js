/** @implements FR-003, NFR-001 — Verify extract_lessons handler creates or skips derived lesson artifacts as expected. */
import { describe, expect, test } from "bun:test";
import { handleExtractLessons } from "./tools-entity.efct.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
const std = createGlobalTestStd(globalThis);
describe("mcp/tools.efct extract_lessons", () => {
	test("creates lesson entries and derived_from links for refuted hypotheses", async () => {
		let createdEntries = 0;
		let createdTriples = 0;
		const result = await handleExtractLessons(
			{ limit: 5 },
			{
				std,
				listRefutedHypotheses: async () => [
					{ id: "h-1", topic: "Bad idea", content: "We should do X" },
				],
				hasLessonForHypothesis: async () => false,
				createEntry: async () => {
					createdEntries += 1;
					return { id: "l-1" };
				},
				createTriple: async () => {
					createdTriples += 1;
					return { id: "t-1" };
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			},
		);
		expect(result.created).toBe(1);
		expect(result.skipped).toBe(0);
		expect(createdEntries).toBe(1);
		expect(createdTriples).toBe(1);
	});
	test("skips hypotheses that already have lessons", async () => {
		let createdEntries = 0;
		let createdTriples = 0;
		const result = await handleExtractLessons(
			{ limit: 5 },
			{
				std,
				listRefutedHypotheses: async () => [
					{ id: "h-1", topic: "Bad idea", content: "We should do X" },
				],
				hasLessonForHypothesis: async () => true,
				createEntry: async () => {
					createdEntries += 1;
					return { id: "l-1" };
				},
				createTriple: async () => {
					createdTriples += 1;
					return { id: "t-1" };
				},
				notifyResourceChange: () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			},
		);
		expect(result.created).toBe(0);
		expect(result.skipped).toBe(1);
		expect(createdEntries).toBe(0);
		expect(createdTriples).toBe(0);
	});
});
