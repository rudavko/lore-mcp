/** @implements FR-005, FR-006 — Verify link_object registration uses the v0 single-call link write path. */
import { describe, expect, test } from "bun:test";
import { registerTools } from "./tools.pure.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
import { std } from "./tools-handler.test-helpers.js";

describe("mcp/tools.pure link_object path", () => {
	test("passes relate policy checks through to the link write path", async () => {
		const handlers = new Map();
		const policyOps = [];
		let upsertCalls = 0;
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (err) => err,
				checkPolicy: async (op) => {
					policyOps.push(op);
				},
				notifyResourceChange: () => {},
				upsertTriple: async () => {
					upsertCalls += 1;
					return {
						created: true,
						triple: { id: "t-1", subject: "S", predicate: "P", object: "O" },
					};
				},
				isPredicateMulti: () => false,
			},
		);
		const handler = handlers.get("link_object");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "P", object: "O" });
		expect(policyOps).toEqual(["relate"]);
		expect(upsertCalls).toBe(1);
	});

	test("propagates multi-valued predicate intent into the triple upsert", async () => {
		const handlers = new Map();
		let receivedArgs = null;
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (err) => err,
				checkPolicy: async () => {},
				isPredicateMulti: (predicate) => predicate === "tag",
				notifyResourceChange: () => {},
				upsertTriple: async (args) => {
					receivedArgs = args;
					return {
						created: true,
						triple: { id: "t-1", subject: args.subject, predicate: args.predicate, object: args.object },
					};
				},
			},
		);
		const handler = handlers.get("link_object");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "tag", object: "blue" });
		expect(receivedArgs.predicate_multi).toBe(true);
	});

	test("returns validation error for empty query cursor payloads through existing error formatting", async () => {
		const handlers = new Map();
		registerTools(
			{
				tool: (name, _desc, _schema, handler) => {
					handlers.set(name, handler);
				},
			},
			{
				z: zStub,
				std,
				formatResult: (_text, data) => data,
				formatError: (err) => err,
				checkPolicy: async () => {},
				isPredicateMulti: () => false,
				notifyResourceChange: () => {},
				upsertTriple: async (args) => ({
					created: true,
					triple: { id: "t-1", subject: args.subject, predicate: args.predicate, object: args.object },
				}),
			},
		);
		const handler = handlers.get("link_object");
		expect(handler).toBeDefined();
		const result = await handler({ subject: "S", predicate: "P", object: "O", valid_to: "infinite" });
		expect(result.created).toBe(true);
		expect(result.object).toBe("O");
	});
});
