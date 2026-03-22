/** @implements FR-001, FR-020 — Verify runtime server configuration registers the v0 MCP surface and wires prompts/resources. */
import { describe, expect, test } from "bun:test";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";
import { createConfigureLoreServerDeps as createBaseConfigureLoreServerDeps } from "../index-runtime-configure-deps.orch.3.js";
import { makeConfigureLoreServer } from "./runtime.orch.1.js";

const std = createGlobalTestStd(globalThis);

function createConfigureLoreServerDeps(overrides = {}) {
	return {
		...createBaseConfigureLoreServerDeps({
			runtimeGlobal: globalThis,
			std,
			appVersion: "9.9.9-test",
		}),
		resourceTemplateCtor: ResourceTemplate,
		observeLogEvent: () => {},
		logSink: () => undefined,
		rowToEntry: (row) => row,
		rowToTriple: (row) => row,
		resolveAliasRow: async () => null,
		selectEntityByName: async () => null,
		toConflictInfo: (value) => value,
		querySummaryCounts: async () => [
			{
				results: [
					{ t: "entries", c: 1 },
					{ t: "triples", c: 2 },
					{ t: "entities", c: 3 },
				],
			},
		],
		...overrides,
	};
}

function extractText(result) {
	const content = result && Array.isArray(result.content) ? result.content : [];
	return content
		.filter((item) => item && item.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("\n");
}

function createRecordingServer() {
	const tools = new Map();
	const prompts = [];
	const resources = [];
	const server = {
		tool: (name, description, schema, handler) => {
			tools.set(name, { name, description, schema, handler });
		},
		prompt: (name, description, handler) => {
			prompts.push({ name, description, handler });
		},
		resource: (name, template, meta, handler) => {
			resources.push({ name, template, meta, handler });
		},
	};
	return { server, tools, prompts, resources };
}

describe("wiring/runtime configureLoreServer integration", () => {
	test("registers v0 tools, prompts, and resources on the configured MCP server", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools, prompts, resources } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-123",
		});

		expect(Array.from(tools.keys())).toEqual([
			"link_object",
			"object_create",
			"retrieve",
			"engine_check",
		]);
		expect(prompts.map((item) => item.name)).toEqual([
			"ingest-memory",
			"retrieve-context",
			"correct-stale-facts",
		]);
		expect(resources.map((item) => item.name)).toEqual([
			"entries",
			"triples",
			"transactions",
		]);
	});

	test("configured engine_check help action returns the supported actions", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("engine_check").handler({ action: "help" });
		const text = extractText(result);
		expect(text).toContain("Engine help");
	});

	test("configured engine_check can issue an auto-updates install link", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("engine_check").handler(
			{ action: "enable_auto_updates" },
			{
				requestInfo: {
					headers: {
						host: "lore.example.com",
						"x-forwarded-proto": "https",
					},
				},
			},
		);
		const text = extractText(result);
		expect(text).toContain("Target repo: owner/example-repo");
		expect(text).toContain("https://lore.example.com/admin/install-workflow?setup_token=");
	});

	test("configured object_create entity path uses the injected upsert entity runtime", async () => {
		const configureLoreServer = makeConfigureLoreServer(
			createConfigureLoreServerDeps({
				upsertEntityOrch: async (input) => ({
					entity: {
						id: "entity-1",
						name: typeof input === "string" ? input : input.name,
						entity_type: "service",
						source: "test",
						confidence: 0.9,
						valid_from: null,
						valid_to: null,
						valid_to_state: "unspecified",
						tags: ["core"],
						produced_by: null,
						about: null,
						affects: null,
						specificity: null,
						created_at: "2026-01-01T00:00:00.000Z",
						updated_at: "2026-01-01T00:00:00.000Z",
					},
					created: true,
					updated: false,
				}),
			}),
		);
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("object_create").handler({
			kind: "entity",
			payload: { name: "Payments API" },
			entity_type: "service",
			source: "test",
			confidence: 0.9,
			tags: ["core"],
		});
		const content = Array.isArray(result.content) ? result.content : [];
		const resourceItem = content.find((item) => item && item.type === "resource");
		expect(resourceItem).toBeDefined();
		expect(resourceItem.resource.uri).toBe("knowledge://entities/entity-1");
		const payload = JSON.parse(resourceItem.resource.text);
		expect(payload.kind).toBe("entity");
		expect(payload.name).toBe("Payments API");
		expect(payload.created).toBe(true);
	});

});
