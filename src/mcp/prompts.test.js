/** @implements NFR-001 — Verify MCP prompt templates. */
import { describe, test, expect } from "bun:test";
import {
	buildIngestMemoryPrompt,
	buildRetrieveContextPrompt,
	buildCorrectStaleFactsPrompt,
} from "./prompts.pure.js";
describe("mcp/prompts.pure", () => {
	test("exports three prompt builders", () => {
		expect(typeof buildIngestMemoryPrompt).toBe("function");
		expect(typeof buildRetrieveContextPrompt).toBe("function");
		expect(typeof buildCorrectStaleFactsPrompt).toBe("function");
	});
	describe("buildIngestMemoryPrompt", () => {
		test("returns messages array with user role", () => {
			const result = buildIngestMemoryPrompt();
			expect(result.messages.length).toBe(1);
			expect(result.messages[0].role).toBe("user");
			expect(result.messages[0].content.type).toBe("text");
		});
		test("mentions store tool", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("store")).toBeGreaterThan(-1);
		});
		test("mentions relate tool", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("relate")).toBeGreaterThan(-1);
		});
		test("nudges agent to set validity intervals and open-ended valid_to", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("valid_from")).toBeGreaterThan(-1);
			expect(text.indexOf("valid_to")).toBeGreaterThan(-1);
			expect(text.indexOf("infinite")).toBeGreaterThan(-1);
		});
	});
	describe("buildRetrieveContextPrompt", () => {
		test("returns messages array with user role", () => {
			const result = buildRetrieveContextPrompt();
			expect(result.messages.length).toBe(1);
			expect(result.messages[0].role).toBe("user");
		});
		test("mentions query tool", () => {
			const result = buildRetrieveContextPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("query")).toBeGreaterThan(-1);
		});
	});
	describe("buildCorrectStaleFactsPrompt", () => {
		test("returns messages array with user role", () => {
			const result = buildCorrectStaleFactsPrompt();
			expect(result.messages.length).toBe(1);
			expect(result.messages[0].role).toBe("user");
		});
		test("mentions audit workflow", () => {
			const result = buildCorrectStaleFactsPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("audit")).toBeGreaterThan(-1);
		});
	});
});
