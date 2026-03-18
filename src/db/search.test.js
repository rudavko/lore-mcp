/** @implements NFR-001 — Verify search pure helpers: FTS5 sanitization, score computation, weight redistribution. */
import { describe, test, expect } from "bun:test";
import {
	sanitizeFts5Query,
	computeTotalScore,
	redistributeWeights,
	likeFallbackScore,
} from "./search.pure.js";
describe("sanitizeFts5Query", () => {
	test("wraps tokens in double quotes", () => {
		expect(sanitizeFts5Query("hello world")).toBe('"hello" "world"');
	});
	test("escapes double quotes inside tokens", () => {
		expect(sanitizeFts5Query('say "hi"')).toBe('"say" """hi"""');
	});
	test("returns empty string for whitespace-only input", () => {
		expect(sanitizeFts5Query("   ")).toBe("");
	});
	test("handles single token", () => {
		expect(sanitizeFts5Query("test")).toBe('"test"');
	});
	test("handles special FTS5 characters", () => {
		expect(sanitizeFts5Query("NOT -excluded")).toBe('"NOT" "-excluded"');
	});
});
describe("computeTotalScore", () => {
	test("computes weighted sum", () => {
		const score = computeTotalScore(0.8, 0.6, 0.4, { lexical: 0.3, semantic: 0.5, graph: 0.2 });
		expect(score).toBeCloseTo(0.8 * 0.3 + 0.6 * 0.5 + 0.4 * 0.2);
	});
	test("zero weights produce zero", () => {
		const score = computeTotalScore(1, 1, 1, { lexical: 0, semantic: 0, graph: 0 });
		expect(score).toBe(0);
	});
});
describe("redistributeWeights", () => {
	test("redistributes semantic weight when no vectorize", () => {
		const w = redistributeWeights({ lexical: 0.3, semantic: 0.5, graph: 0.2 }, false);
		expect(w.semantic).toBe(0);
		expect(w.lexical).toBeCloseTo(0.3 + 0.5 * 0.6);
		expect(w.graph).toBeCloseTo(0.2 + 0.5 * 0.4);
	});
	test("preserves weights when vectorize available", () => {
		const w = redistributeWeights({ lexical: 0.3, semantic: 0.5, graph: 0.2 }, true);
		expect(w.lexical).toBe(0.3);
		expect(w.semantic).toBe(0.5);
		expect(w.graph).toBe(0.2);
	});
});
describe("likeFallbackScore", () => {
	test("exact topic match scores 1.0", () => {
		expect(likeFallbackScore("Alice", "alice", "some content about alice")).toBe(1.0);
	});
	test("topic contains query scores 0.8", () => {
		expect(likeFallbackScore("alice in wonderland", "alice", "content")).toBe(0.8);
	});
	test("content contains query scores 0.5", () => {
		expect(likeFallbackScore("other topic", "alice", "content about alice")).toBe(0.5);
	});
	test("no match scores 0.3", () => {
		expect(likeFallbackScore("other", "alice", "nothing")).toBe(0.3);
	});
});
