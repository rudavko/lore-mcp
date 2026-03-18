/** @implements FR-004, FR-008, FR-017, NFR-005 — Verify resource templates expose list callbacks for MCP resources/list discoverability. */
import { describe, expect, test } from "bun:test";
import { registerResources } from "./resources.efct.js";
describe("mcp/resources.efct registerResources", () => {
	test("registers discoverable list callbacks for all MCP resource templates", () => {
		const registrations = [];
		registerResources(
			{
				resource: (name, template, opts, handler) => {
					registrations.push({
						name,
						template: template,
						opts,
						handler,
					});
				},
			},
			{
				createResourceTemplate: (uri, list) => ({ uri, list }),
				rowToEntry: (row) => row,
				rowToTriple: (row) => row,
				decodeCursor: () => null,
				dbQuery: async () => ({ results: [] }),
				btoa: (value) => value,
				jsonStringify: JSON.stringify,
			},
		);
		expect(registrations.map((entry) => entry.name)).toEqual([
			"entries",
			"triples",
			"transactions",
		]);
		expect(registrations.map((entry) => entry.template.list().resources)).toEqual([
			[{ uri: "knowledge://entries", name: "entries" }],
			[{ uri: "knowledge://graph/triples", name: "triples" }],
			[{ uri: "knowledge://history/transactions", name: "transactions" }],
		]);
	});
});
