/** @implements FR-010, NFR-002 — Verify runtime prompt binding for ingest/retrieve/correct-stale workflows. */
import { describe, expect, test } from "bun:test";
import { installPrompts } from "./runtime.orch.1.js";
describe("wiring/runtime.efct installPrompts", () => {
	test("invokes server.prompt with server context", () => {
		const registered = [];
		const server = {
			_registeredPrompts: registered,
			prompt: (name, _description, _handler) => {
				registered.push(name);
			},
		};
		expect(() =>
			installPrompts(server, {
				buildIngestMemoryPrompt: () => ({}),
				buildRetrieveContextPrompt: () => ({}),
				buildCorrectStaleFactsPrompt: () => ({}),
			}),
		).not.toThrow();
		expect(registered).toEqual(["ingest-memory", "retrieve-context", "correct-stale-facts"]);
	});
});
