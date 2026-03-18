/** @implements NFR-001 — Verify MCP subscription pure helpers. */
import { describe, test, expect } from "bun:test";
import { TRANSACTIONS_URI, resolveEntityUri, ENTITY_URI_ENTRIES } from "./subscriptions.pure.js";
describe("mcp/subscriptions.pure", () => {
	test("TRANSACTIONS_URI is a knowledge URI", () => {
		expect(TRANSACTIONS_URI.indexOf("knowledge://")).toBe(0);
	});
	describe("resolveEntityUri", () => {
		test("entry maps to entries URI", () => {
			const uri = resolveEntityUri("entry");
			expect(uri).toBe(ENTITY_URI_ENTRIES);
		});
		test("triple maps to triples URI", () => {
			const uri = resolveEntityUri("triple");
			expect(uri.indexOf("triples")).toBeGreaterThan(-1);
		});
		test("entity maps to entries URI", () => {
			expect(resolveEntityUri("entity")).toBe(ENTITY_URI_ENTRIES);
		});
		test("alias maps to entries URI", () => {
			expect(resolveEntityUri("alias")).toBe(ENTITY_URI_ENTRIES);
		});
		test("unknown entity type falls back to entries URI", () => {
			expect(resolveEntityUri("unknown")).toBe(ENTITY_URI_ENTRIES);
		});
	});
});
