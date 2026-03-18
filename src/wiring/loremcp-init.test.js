/** @implements FR-001, ADR-0001 — Verify initialization wiring creates runtime surfaces from a single dependency index. */
import { describe, expect, test } from "bun:test";
import { makeInitLoreMcp, makeProcessLoreIngestion } from "./loremcp.efct.js";
import { createBaseStd } from "../test-helpers/runtime.shared.test.js";
describe("wiring/loremcp.efct makeInitLoreMcp", () => {
	test("keeps startup alive when processIngestion throws", async () => {
		let configured = false;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => [],
			formatSummary: () => "summary",
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
			configureServer: async () => {
				configured = true;
			},
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => Promise.reject(new Error("ingestion failed")),
		};
		await init(runtime);
		expect(configured).toBe(true);
		expect(runtime.server).toEqual(
			expect.objectContaining({
				opts: {
					name: "Lore",
					version: "0.0.0-test",
					instructions: "summary",
				},
			}),
		);
	});

	test("maps summary rows before formatting instructions", async () => {
		let seenSummaryData = null;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => [
				{
					results: [
						{ t: "entries", c: "2" },
						{ t: "triples", c: "3" },
						{ t: "entities", c: 4 },
					],
				},
				{ results: [{ topic: "Topic A" }, { topic: 42 }] },
				{
					results: [
						{ subject: "S", predicate: "P", object: "O" },
						{ subject: "skip", predicate: "skip", object: null },
					],
				},
				{ results: [{ tags: '["alpha","beta",1]' }, { tags: "not-json" }] },
			],
			formatSummary: (data) => {
				seenSummaryData = data;
				return "summary";
			},
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => {},
		};

		await init(runtime);

		expect(seenSummaryData).toEqual({
			entries: 2,
			triples: 3,
			entities: 4,
			topics: ["Topic A"],
			tripleSamples: [{ subject: "S", predicate: "P", object: "O" }],
			tagLists: [["alpha", "beta"]],
		});
	});

	test("falls back to default summary when summary queries fail", async () => {
		let formatSummaryCalled = false;
		function FakeServer(opts) {
			return { opts };
		}
		const init = makeInitLoreMcp({
			std: createBaseStd(globalThis),
			initSchema: async () => {},
			querySummaryCounts: async () => Promise.reject(new Error("summary failed")),
			formatSummary: () => {
				formatSummaryCalled = true;
				return "unexpected";
			},
			McpServerCtor: FakeServer,
			serverName: "Lore",
			serverVersion: "0.0.0-test",
		});
		const runtime = {
			env: { DB: {} },
			server: null,
			processIngestion: async () => {},
		};

		await init(runtime);

		expect(runtime.server.opts.instructions).toBe(
			"Lore knowledge store — summary unavailable.",
		);
		expect(formatSummaryCalled).toBe(false);
	});
});

describe("wiring/loremcp.efct makeProcessLoreIngestion", () => {
	test("schedules another ingestion pass when work remains", async () => {
		const scheduled = [];
		function FakeDate(value) {
			return { value };
		}
		const processLoreIngestion = makeProcessLoreIngestion({
			runIngestion: async (env, server) => {
				expect(env).toEqual({ DB: "db-handle" });
				expect(server).toEqual({ id: "server-1" });
				return 2;
			},
			shouldReschedule: (remaining) => remaining > 0,
			rescheduleDelayMs: 60000,
			nowMs: () => 1000,
			dateCtor: FakeDate,
		});

		await processLoreIngestion({
			env: { DB: "db-handle" },
			server: { id: "server-1" },
			schedule: async (when, label) => {
				scheduled.push({ when, label });
			},
		});

		expect(scheduled).toEqual([
			{
				when: expect.objectContaining({ value: 61000 }),
				label: "processIngestion",
			},
		]);
	});

	test("does not schedule when no work remains", async () => {
		const scheduled = [];
		const processLoreIngestion = makeProcessLoreIngestion({
			runIngestion: async () => 0,
			shouldReschedule: () => false,
			rescheduleDelayMs: 60000,
			nowMs: () => 1000,
			dateCtor: Date,
		});

		await processLoreIngestion({
			env: { DB: "db-handle" },
			server: { id: "server-1" },
			schedule: async (...args) => {
				scheduled.push(args);
			},
		});

		expect(scheduled).toEqual([]);
	});
});
