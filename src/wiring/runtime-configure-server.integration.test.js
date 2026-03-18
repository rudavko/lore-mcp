/** @implements FR-001, FR-020 — Verify runtime server configuration registers the MCP surface and wires request-origin auto-update links. */
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
	test("registers tools, prompts, and resources on the configured MCP server", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools, prompts, resources } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-123",
		});

		expect(Array.from(tools.keys())).toContain("build_info");
		expect(Array.from(tools.keys())).toContain("enable_auto_updates");
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

	test("configured build_info tool reflects env build metadata", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("build_info").handler({});
		expect(extractText(result)).toContain("Build 9.9.9-test (build-hash-xyz)");
	});

	test("configured enable_auto_updates tool derives an absolute URL from request headers", async () => {
		const configureLoreServer = makeConfigureLoreServer(createConfigureLoreServerDeps());
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("enable_auto_updates").handler(
			{},
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
		expect(text).toContain("URL: https://lore.example.com/admin/install-workflow?setup_token=");
		expect(text.includes("\nPath: ")).toBe(false);
	});

	test("configured query_entities tool returns a normalized empty result", async () => {
		const configureLoreServer = makeConfigureLoreServer(
			createConfigureLoreServerDeps({
				queryCanonicalEntityRows: async () => [],
				queryAliasRowsByEntityIds: async () => [],
			}),
		);
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		const result = await tools.get("query_entities").handler({ name: "missing-topic" });
		const text = extractText(result);
		const content = Array.isArray(result.content) ? result.content : [];
		let resourceItem = null;
		for (let i = 0; i < content.length; i++) {
			if (content[i] && content[i].type === "resource") {
				resourceItem = content[i];
				break;
			}
		}

		expect(text).toContain("No entities found");
		expect(resourceItem).toBeDefined();
		expect(resourceItem.resource.uri).toBe("knowledge://entities");
		expect(JSON.parse(resourceItem.resource.text)).toEqual({
			items: [],
			next_cursor: null,
		});
	});

	test("configured store and update tools forward entry orchestration deps", async () => {
		const calls = [];
		const configureLoreServer = makeConfigureLoreServer(
			createConfigureLoreServerDeps({
				handleStore: async (args, runtimeDeps) => {
					calls.push({ name: "store", args, runtimeDeps });
					return { ok: true, name: "store" };
				},
				handleUpdate: async (args, runtimeDeps) => {
					calls.push({ name: "update", args, runtimeDeps });
					return { ok: true, name: "update" };
				},
			}),
		);
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		expect(await tools.get("store").handler({ topic: "topic", content: "content" })).toEqual(
			{
				ok: true,
				name: "store",
			},
		);
		expect(
			await tools.get("update").handler({
				id: "entry-1",
				content: "updated",
			}),
		).toEqual({
			ok: true,
			name: "update",
		});

		expect(calls).toHaveLength(2);
		expect(typeof calls[0].runtimeDeps.createAndEmbed).toBe("function");
		expect(typeof calls[0].runtimeDeps.checkPolicy).toBe("function");
		expect(typeof calls[1].runtimeDeps.updateAndEmbed).toBe("function");
		expect(typeof calls[1].runtimeDeps.updateAndEmbed).toBe("function");
	});

	test("configured query tool forwards hybrid and plain search deps", async () => {
		const calls = [];
		const configureLoreServer = makeConfigureLoreServer(
			createConfigureLoreServerDeps({
				handleQueryPlain: async (args, runtimeDeps) => {
					calls.push({ name: "query-plain", args, runtimeDeps });
					return { ok: true, mode: "plain" };
				},
				handleQueryHybrid: async (args, runtimeDeps) => {
					calls.push({ name: "query-hybrid", args, runtimeDeps });
					return { ok: true, mode: "hybrid" };
				},
			}),
		);
		const { server, tools } = createRecordingServer();

		await configureLoreServer(server, {
			DB: {},
			ACCESS_PASSPHRASE: "test-pass",
			TARGET_REPO: "owner/example-repo",
			BUILD_HASH: "build-hash-xyz",
		});

		expect(await tools.get("query").handler({ limit: 5 })).toEqual({
			ok: true,
			mode: "plain",
		});
		expect(await tools.get("query").handler({ topic: "topic" })).toEqual({
			ok: true,
			mode: "hybrid",
		});
		expect(calls).toHaveLength(2);
		expect(typeof calls[0].runtimeDeps.queryEntries).toBe("function");
		expect(typeof calls[0].runtimeDeps.normalizeValidToState).toBe("function");
		expect(typeof calls[1].runtimeDeps.hybridSearch).toBe("function");
		expect(typeof calls[1].runtimeDeps.normalizeValidToState).toBe("function");
	});
});
