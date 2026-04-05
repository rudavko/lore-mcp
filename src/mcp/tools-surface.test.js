/** @implements FR-001, FR-002, FR-003 — Verify the registered MCP tool surface remains complete. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.orch.1.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.helper.js";
import { zStub } from "../test-helpers/mcp-zod-stub.helper.js";
const std = createGlobalTestStd(globalThis);
const EXPECTED_TOOLS = [
	"link_object",
	"object_create",
	"retrieve",
	"engine_check",
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

	test("engine_check help returns machine-readable action metadata", async () => {
		const handlers = {};
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
			},
		);
		const result = await handlers.engine_check({ action: "help" });
		expect(result.action).toBe("help");
		expect(result.tools).toEqual(["link_object", "object_create", "retrieve", "engine_check"]);
		expect(Array.isArray(result.actions)).toBe(true);
		expect(result.actions[0].name).toBe("help");
		expect(result.actions[2].name).toBe("history");
		expect(result.actions[2].optional).toContain("limit");
		expect(result.actions[3].name).toBe("auto_updates_status");
		expect(result.actions[4].name).toBe("enable_auto_updates");
		expect(result.examples.retrieve.query).toContain("Alice");
		expect(result.examples.engine_check_auto_updates_status.action).toBe("auto_updates_status");
		expect(result.examples.engine_check_enable_auto_updates.action).toBe("enable_auto_updates");
		expect(result.deprecations.replaced_by.update).toContain("supersedes");
	});

	test("engine_check help returns per-tool parameter contracts and usage examples", async () => {
		const handlers = {};
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
			},
		);
		const result = await handlers.engine_check({ action: "help" });
		expect(result.tool_contracts.retrieve.parameters.query.required).toBe(true);
		expect(result.tool_contracts.retrieve.parameters.limit.required).toBe(false);
		expect(result.tool_contracts.retrieve.example.query).toContain("Alice");
		expect(result.tool_contracts.engine_check.parameters.action.required).toBe(true);
		expect(result.tool_contracts.engine_check.example.action).toBe("status");
	});

	test("engine_check can report auto-updates install-flow limits", async () => {
		const handlers = {};
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
			},
		);
		const result = await handlers.engine_check({ action: "auto_updates_status" });
		expect(result.action).toBe("auto_updates_status");
		expect(result.configured).toBe(false);
		expect(result.target_repo).toBeNull();
		expect(result.setup_mode).toBe("one_time_browser_link");
		expect(result.installation_state).toBe("not_installed");
	});

	test("engine_check can dispatch enable_auto_updates without adding a fifth tool", async () => {
		const handlers = {};
		registerTools(
			{
				tool: (name, _description, _schema, handler) => {
					handlers[name] = handler;
				},
			},
			{
				z: zStub,
				std,
				autoUpdatesLinkTtlSeconds: 900,
				buildEnableAutoUpdatesPath: (setupToken) =>
					"/admin/install-workflow?setup_token=" + setupToken,
				buildEnableAutoUpdatesUrl: (baseUrl, setupToken) =>
					baseUrl + "/admin/install-workflow?setup_token=" + setupToken,
				formatResult: (_text, data) => data,
				formatError: (error) => error,
				resolveAutoUpdatesInstallContext: async () => ({
					mode: "workers_build_ref",
					branch: "main",
					commitSha: "buildsha",
				}),
				issueAutoUpdatesSetupToken: async () => "setup-token-1",
				logEvent: () => undefined,
				resolveEnableAutoUpdatesBaseUrl: () => "https://example.com",
			},
		);
		const result = await handlers.engine_check({ action: "enable_auto_updates" });
		expect(result.target_repo).toBeNull();
		expect(result.url).toBe("https://example.com/admin/install-workflow?setup_token=setup-token-1");
	});

	test("object_create note preserves payload.name as the returned topic", async () => {
		const handlers = {};
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
				checkPolicy: async () => undefined,
				createAndEmbed: async (entryArgs) => ({
					id: "entry-1",
					...entryArgs,
					created_at: "2026-03-30T00:00:00.000Z",
					updated_at: "2026-03-30T00:00:00.000Z",
					embedding_status: "ready",
				}),
				notifyResourceChange: () => undefined,
				isPredicateMulti: () => false,
				upsertTriple: async () => {
					throw new Error("not expected");
				},
			},
		);
		const result = await handlers.object_create({
			kind: "note",
			payload: {
				name: "Operator Guide",
				body: "Body line one\nBody line two",
			},
		});
		expect(result.topic).toBe("Operator Guide");
		expect(result.body).toBe("Body line one\nBody line two");
	});
});
