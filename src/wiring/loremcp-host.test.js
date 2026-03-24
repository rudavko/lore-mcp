/** @implements FR-001, FR-003 — Verify Lore MCP instance host adapter preserves runtime shape. */
import { describe, expect, test } from "bun:test";
import { createLoreMcpInstanceHost } from "./loremcp-host.orch.4.js";

describe("wiring/loremcp-host", () => {
	test("maps instance env, server, and schedule/process hooks through stable accessors", async () => {
		const calls = [];
		const instance = {
			env: { DB: { label: "db" } },
			server: { id: "server-1" },
			processIngestion: async (...args) => {
				calls.push({ kind: "processIngestion", args });
				return "processed";
			},
			schedule: async (...args) => {
				calls.push({ kind: "schedule", args });
				return "scheduled";
			},
		};
		const host = createLoreMcpInstanceHost(instance);

		expect(host.db).toBe(instance.env.DB);
		expect(host.env).toBe(instance.env);
		expect(host.getServer()).toBe(instance.server);

		host.setServer({ id: "server-2" });
		expect(instance.server).toEqual({ id: "server-2" });

		await host.processIngestion("a");
		await host.schedule("when", "processIngestion");

		expect(calls).toEqual([
			{ kind: "processIngestion", args: ["a"] },
			{ kind: "schedule", args: ["when", "processIngestion"] },
		]);
	});
});
