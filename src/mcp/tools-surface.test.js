/** @implements FR-001, FR-002, FR-003 — Verify the registered MCP tool surface remains complete. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
const std = createGlobalTestStd(globalThis);
const EXPECTED_TOOLS = [
	"store",
	"update",
	"query",
	"delete",
	"set_type",
	"extract_lessons",
	"relate",
	"query_graph",
	"update_triple",
	"upsert_triple",
	"resolve_conflict",
	"upsert_entity",
	"merge_entities",
	"query_entities",
	"history",
	"undo",
	"ingest",
	"ingestion_status",
	"build_info",
	"time",
	"enable_auto_updates",
];
describe("mcp/tools.pure surface", () => {
	test("registers every supported tool on the MCP server surface", () => {
		const names = [];
		registerTools(
			{
				tool: (name) => {
					names.push(name);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
			},
		);
		expect(names).toHaveLength(EXPECTED_TOOLS.length);
		for (let i = 0; i < EXPECTED_TOOLS.length; i++) {
			expect(names.includes(EXPECTED_TOOLS[i])).toBe(true);
		}
	});

	test("enable_auto_updates registration forwards request headers and link helpers", async () => {
		const handlers = {};
		const autoUpdatesLinkTtlSeconds = 900;
		const buildEnableAutoUpdatesPath = (token) => `/admin/install-workflow?setup_token=${token}`;
		const buildEnableAutoUpdatesUrl = (baseUrl, token) =>
			`${baseUrl}/admin/install-workflow?setup_token=${token}`;
		const resolveEnableAutoUpdatesBaseUrl = (headers) =>
			headers.host === "lore.example.com" ? "https://lore.example.com" : "";
		registerTools(
			{
				tool: (name, _description, _schema, handler) => {
					handlers[name] = handler;
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
				autoUpdatesLinkTtlSeconds,
				buildEnableAutoUpdatesPath,
				buildEnableAutoUpdatesUrl,
				resolveEnableAutoUpdatesBaseUrl,
				efctEnableAutoUpdates: async (_args, deps) => deps,
			},
		);
		const result = await handlers.enable_auto_updates(
			{},
			{
				requestInfo: {
					headers: {
						host: "lore.example.com",
					},
				},
			},
		);
		expect(result.requestHeaders).toEqual({ host: "lore.example.com" });
		expect(result.autoUpdatesLinkTtlSeconds).toBe(autoUpdatesLinkTtlSeconds);
		expect(result.buildEnableAutoUpdatesPath).toBe(buildEnableAutoUpdatesPath);
		expect(result.buildEnableAutoUpdatesUrl).toBe(buildEnableAutoUpdatesUrl);
		expect(result.resolveEnableAutoUpdatesBaseUrl).toBe(resolveEnableAutoUpdatesBaseUrl);
	});
});
