/** @implements NFR-001 — Verify summary building from raw DB data. */
import { describe, test, expect } from "bun:test";
import { formatSummary } from "./summary.pure.js";
describe("formatSummary", () => {
	test("empty store returns guidance message", () => {
		const data = {
			entries: 0,
			triples: 0,
			entities: 0,
			topics: [],
			tripleSamples: [],
			tagLists: [],
		};
		const result = formatSummary(data);
		expect(result).toContain("empty");
	});
	test("includes counts", () => {
		const data = {
			entries: 5,
			triples: 3,
			entities: 2,
			topics: ["physics"],
			tripleSamples: [],
			tagLists: [],
		};
		const result = formatSummary(data);
		expect(result).toContain("5 entries");
		expect(result).toContain("3 triples");
	});
	test("includes recent topics", () => {
		const data = {
			entries: 1,
			triples: 0,
			entities: 0,
			topics: ["physics", "math"],
			tripleSamples: [],
			tagLists: [],
		};
		const result = formatSummary(data);
		expect(result).toContain("physics");
		expect(result).toContain("math");
	});
	test("includes top tags", () => {
		const data = {
			entries: 2,
			triples: 0,
			entities: 0,
			topics: [],
			tripleSamples: [],
			tagLists: [
				["ai", "ml"],
				["ai", "nlp"],
			],
		};
		const result = formatSummary(data);
		expect(result).toContain("ai (2)");
	});
	test("includes recent graph", () => {
		const data = {
			entries: 0,
			triples: 1,
			entities: 0,
			topics: [],
			tagLists: [],
			tripleSamples: [{ subject: "A", predicate: "knows", object: "B" }],
		};
		const result = formatSummary(data);
		expect(result).toContain("A --knows--> B");
	});
});
