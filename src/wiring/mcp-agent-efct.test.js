/** @implements FR-001 — Verify the MCP agent constructor wrapper binds init and ingestion hooks to the constructed instance. */
import { describe, expect, test } from "bun:test";
import { createLoreMcpCtor } from "./mcp-agent.efct.js";

describe("wiring/mcp-agent.efct", () => {
	test("defines init and processIngestion methods that delegate with the constructed instance", async () => {
		const initCalls = [];
		const ingestionCalls = [];
		function proxyCtor(target, handler) {
			return new globalThis.Proxy(target, handler);
		}
		function reflectConstruct(target, args, newTarget) {
			return globalThis.Reflect.construct(target, args, newTarget);
		}

		function BaseAgent(name) {
			return { name };
		}

		const LoreMcp = createLoreMcpCtor({
			McpAgentCtor: BaseAgent,
			proxyCtor,
			reflectConstruct,
			defineProperties: Object.defineProperties,
			init: async (instance, ...args) => {
				initCalls.push([instance, ...args]);
				return "init-ok";
			},
			processIngestion: async (instance, ...args) => {
				ingestionCalls.push([instance, ...args]);
				return "ingest-ok";
			},
		});

		const instance = new LoreMcp("Lore");
		const initResult = await instance.init("a", "b");
		const ingestionResult = await instance.processIngestion("x");

		expect(instance.name).toBe("Lore");
		expect(initResult).toBe("init-ok");
		expect(ingestionResult).toBe("ingest-ok");
		expect(initCalls).toEqual([[instance, "a", "b"]]);
		expect(ingestionCalls).toEqual([[instance, "x"]]);
	});
});
