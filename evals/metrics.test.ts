import { describe, expect, test } from "bun:test";
import { ndcgAtK, mrrAtK, recallAtK } from "./metrics";

describe("ndcgAtK", () => {
	test("perfect ranking returns 1.0", () => {
		const ranked = ["a", "b", "c"];
		const relevant = new Set(["a", "b", "c"]);
		expect(ndcgAtK(ranked, relevant, 10)).toBeCloseTo(1.0, 5);
	});

	test("first result relevant returns 1.0 for single relevant item", () => {
		const ranked = ["a", "b", "c"];
		const relevant = new Set(["a"]);
		expect(ndcgAtK(ranked, relevant, 10)).toBeCloseTo(1.0, 5);
	});

	test("relevant item at position 2 returns < 1.0", () => {
		const ranked = ["x", "a", "y"];
		const relevant = new Set(["a"]);
		const score = ndcgAtK(ranked, relevant, 10);
		expect(score).toBeGreaterThan(0);
		expect(score).toBeLessThan(1.0);
	});

	test("no relevant items returns 0", () => {
		expect(ndcgAtK(["x", "y"], new Set(["a"]), 10)).toBe(0);
	});

	test("empty ranked list returns 0", () => {
		expect(ndcgAtK([], new Set(["a"]), 10)).toBe(0);
	});

	test("empty relevant set returns 0", () => {
		expect(ndcgAtK(["a", "b"], new Set(), 10)).toBe(0);
	});

	test("respects k cutoff", () => {
		const ranked = ["x", "x", "x", "a"]; // relevant at position 4
		const relevant = new Set(["a"]);
		expect(ndcgAtK(ranked, relevant, 3)).toBe(0); // cutoff before position 4
		expect(ndcgAtK(ranked, relevant, 4)).toBeGreaterThan(0);
	});
});

describe("mrrAtK", () => {
	test("first result relevant returns 1.0", () => {
		expect(mrrAtK(["a", "b"], new Set(["a"]), 10)).toBe(1.0);
	});

	test("second result relevant returns 0.5", () => {
		expect(mrrAtK(["x", "a"], new Set(["a"]), 10)).toBe(0.5);
	});

	test("third result relevant returns 1/3", () => {
		expect(mrrAtK(["x", "y", "a"], new Set(["a"]), 10)).toBeCloseTo(1 / 3, 5);
	});

	test("no relevant results returns 0", () => {
		expect(mrrAtK(["x", "y"], new Set(["a"]), 10)).toBe(0);
	});

	test("respects k cutoff", () => {
		expect(mrrAtK(["x", "x", "a"], new Set(["a"]), 2)).toBe(0);
		expect(mrrAtK(["x", "x", "a"], new Set(["a"]), 3)).toBeCloseTo(1 / 3, 5);
	});

	test("multiple relevant items returns reciprocal of first", () => {
		// MRR only cares about the first relevant result
		expect(mrrAtK(["x", "a", "b"], new Set(["a", "b"]), 10)).toBe(0.5);
	});
});

describe("recallAtK", () => {
	test("all relevant found returns 1.0", () => {
		expect(recallAtK(["a", "b", "c"], new Set(["a", "b"]), 10)).toBe(1.0);
	});

	test("partial recall returns fraction", () => {
		expect(recallAtK(["a", "x"], new Set(["a", "b"]), 10)).toBe(0.5);
	});

	test("no relevant found returns 0", () => {
		expect(recallAtK(["x", "y"], new Set(["a", "b"]), 10)).toBe(0);
	});

	test("empty relevant set returns 0", () => {
		expect(recallAtK(["a", "b"], new Set(), 10)).toBe(0);
	});

	test("respects k cutoff", () => {
		// "b" is at position 3, cut off at k=2
		expect(recallAtK(["a", "x", "b"], new Set(["a", "b"]), 2)).toBe(0.5);
		expect(recallAtK(["a", "x", "b"], new Set(["a", "b"]), 3)).toBe(1.0);
	});

	test("recall with 3 of 4 relevant items", () => {
		expect(recallAtK(["a", "b", "c", "x"], new Set(["a", "b", "c", "d"]), 10)).toBe(0.75);
	});
});
