/** @implements NFR-001 — Verify MCP prompt templates. */
import { describe, test, expect } from "bun:test";
import {
	buildIngestMemoryPrompt,
	buildRetrieveContextPrompt,
	buildCorrectStaleFactsPrompt,
} from "./prompts.pure.js";
describe("mcp/prompts.pure", () => {
	describe("buildIngestMemoryPrompt", () => {
		test("mentions object_create tool", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("object_create")).toBeGreaterThan(-1);
		});
		test("mentions link_object tool", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("link_object")).toBeGreaterThan(-1);
		});
		test("nudges agent to set validity intervals", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("valid_from")).toBeGreaterThan(-1);
			expect(text.indexOf("valid_to")).toBeGreaterThan(-1);
		});
		test("contains cookbook-style examples and deprecation workflow", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("Cookbook")).toBeGreaterThan(-1);
			expect(text.indexOf("Example:")).toBeGreaterThan(-1);
			expect(text.indexOf("supersedes")).toBeGreaterThan(-1);
			expect(text.indexOf("deleted")).toBeGreaterThan(-1);
		});
		test("does not teach non-public mutation tools", () => {
			const result = buildIngestMemoryPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("`store`")).toBe(-1);
			expect(text.indexOf("`update`")).toBe(-1);
			expect(text.indexOf("`delete`")).toBe(-1);
		});
	});
	describe("buildRetrieveContextPrompt", () => {
		test("mentions retrieve tool", () => {
			const result = buildRetrieveContextPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("retrieve")).toBeGreaterThan(-1);
		});
		test("contains concrete retrieve examples and engine_check actions", () => {
			const result = buildRetrieveContextPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("Example:")).toBeGreaterThan(-1);
			expect(text.indexOf("include_links")).toBeGreaterThan(-1);
			expect(text.indexOf("include_auto_links")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`history`")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`status`")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`auto_updates_status`")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`enable_auto_updates`")).toBeGreaterThan(-1);
		});
		test("does not teach non-public retrieval tools", () => {
			const result = buildRetrieveContextPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("`query`")).toBe(-1);
			expect(text.indexOf("`query_graph`")).toBe(-1);
			expect(text.indexOf("`query_entities`")).toBe(-1);
		});
	});
	describe("buildCorrectStaleFactsPrompt", () => {
		test("mentions audit workflow", () => {
			const result = buildCorrectStaleFactsPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("audit")).toBeGreaterThan(-1);
		});
		test("teaches supersedes and deleted workflow", () => {
			const result = buildCorrectStaleFactsPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("supersedes")).toBeGreaterThan(-1);
			expect(text.indexOf("deleted")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`history`")).toBeGreaterThan(-1);
			expect(text.indexOf("action=`auto_updates_status`")).toBeGreaterThan(-1);
		});
		test("does not teach in-place correction via non-public tools", () => {
			const result = buildCorrectStaleFactsPrompt();
			const text = result.messages[0].content.text;
			expect(text.indexOf("`update`")).toBe(-1);
			expect(text.indexOf("`delete`")).toBe(-1);
			expect(text.indexOf("`resolve_conflict`")).toBe(-1);
		});
	});
});
