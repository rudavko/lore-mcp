/** @implements FR-005, FR-006 — Verify upsert/relate conflict branching and resolution-path dispatch. */
import { describe, expect, test } from "bun:test";
import { handleRelateConflict } from "./tools-graph-relate.efct.js";
import { registerTools } from "./tools.pure.js";
import { zStub } from "../test-helpers/mcp-zod-stub.test.js";
import { std, withGraphHandlerDeps } from "./tools-handler.test-helpers.js";
describe("mcp/tools.pure upsert_triple conflict path", () => {
	test("relate conflict omits unspecified valid_to_state from nested payload", async () => {
		const result = await handleRelateConflict(
			{
				subject: "S",
				predicate: "P",
				conflict: {
					conflict_id: "c-1",
					scope: "S/P",
					existing: {
						id: "t-1",
						subject: "S",
						predicate: "P",
						object: "old",
						valid_to_state: "unspecified",
					},
					incoming: {
						subject: "S",
						predicate: "P",
						object: "new",
					},
					candidate_resolutions: ["replace"],
				},
			},
			withGraphHandlerDeps({
				checkPolicy: async () => {},
				saveConflict: async () => {},
				logEvent: () => {},
				formatResult: (_text, data) => data,
			}),
		);
		const existing = result.existing || {};
		expect(existing.valid_to_state).toBeUndefined();
	});
	test("passes checkPolicy through to relate-conflict effect", async () => {
		const handlers = new Map();
		const policyOps = [];
		let savedConflict = false;
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
				detectConflict: async () => ({
					conflict_id: "c-1",
					scope: "subject+predicate",
					subject: "S",
					predicate: "P",
					existing: { object: "old" },
					incoming: { object: "new" },
				}),
				saveConflict: async () => {
					savedConflict = true;
				},
				logEvent: () => {},
				efctRelateConflict: handleRelateConflict,
				efctUpsertTriple: async () => ({}),
			},
		);
		const handler = handlers.get("upsert_triple");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "P", object: "new" });
		expect(savedConflict).toBe(true);
		expect(policyOps).toEqual(["upsert_triple", "relate"]);
	});
	test("bypasses conflict path when predicate is configured multi-valued", async () => {
		const handlers = new Map();
		let detectConflictCalled = false;
		let conflictPathCalled = false;
		let upsertPathCalled = false;
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
				detectConflict: async () => {
					detectConflictCalled = true;
					return { conflict_id: "c-1" };
				},
				efctRelateConflict: async () => {
					conflictPathCalled = true;
					return {};
				},
				efctUpsertTriple: async (_args) => {
					upsertPathCalled = true;
					return {};
				},
			},
		);
		const handler = handlers.get("upsert_triple");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "tag", object: "blue" });
		expect(detectConflictCalled).toBe(false);
		expect(conflictPathCalled).toBe(false);
		expect(upsertPathCalled).toBe(true);
	});
	test("bypasses conflict path when args.multi=true", async () => {
		const handlers = new Map();
		let detectConflictCalled = false;
		let conflictPathCalled = false;
		let upsertPathCalled = false;
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
				detectConflict: async () => {
					detectConflictCalled = true;
					return { conflict_id: "c-1" };
				},
				efctRelateConflict: async () => {
					conflictPathCalled = true;
					return {};
				},
				efctUpsertTriple: async (_args) => {
					upsertPathCalled = true;
					return {};
				},
			},
		);
		const handler = handlers.get("upsert_triple");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "any_predicate", object: "blue", multi: true });
		expect(detectConflictCalled).toBe(false);
		expect(conflictPathCalled).toBe(false);
		expect(upsertPathCalled).toBe(true);
	});
	test("relate bypasses conflict path when predicate is configured multi-valued", async () => {
		const handlers = new Map();
		let detectConflictCalled = false;
		let conflictPathCalled = false;
		let relateCreateCalled = false;
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
				detectConflict: async () => {
					detectConflictCalled = true;
					return { conflict_id: "c-1" };
				},
				efctRelateConflict: async () => {
					conflictPathCalled = true;
					return {};
				},
				efctRelateCreate: async () => {
					relateCreateCalled = true;
					return {};
				},
			},
		);
		const handler = handlers.get("relate");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "tag", object: "blue" });
		expect(detectConflictCalled).toBe(false);
		expect(conflictPathCalled).toBe(false);
		expect(relateCreateCalled).toBe(true);
	});
	test("relate bypasses conflict path when args.multi=true", async () => {
		const handlers = new Map();
		let detectConflictCalled = false;
		let conflictPathCalled = false;
		let relateCreateCalled = false;
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
				detectConflict: async () => {
					detectConflictCalled = true;
					return { conflict_id: "c-1" };
				},
				efctRelateConflict: async () => {
					conflictPathCalled = true;
					return {};
				},
				efctRelateCreate: async () => {
					relateCreateCalled = true;
					return {};
				},
			},
		);
		const handler = handlers.get("relate");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "any_predicate", object: "blue", multi: true });
		expect(detectConflictCalled).toBe(false);
		expect(conflictPathCalled).toBe(false);
		expect(relateCreateCalled).toBe(true);
	});
	test("upsert_triple rejects invalid validity interval before conflict detection", async () => {
		const handlers = new Map();
		let detectConflictCalled = false;
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
				detectConflict: async () => {
					detectConflictCalled = true;
					return null;
				},
				efctRelateConflict: async () => ({}),
				efctUpsertTriple: async () => ({}),
			},
		);
		const handler = handlers.get("upsert_triple");
		expect(handler).toBeDefined();
		const result = await handler({
			subject: "S",
			predicate: "P",
			object: "O",
			valid_from: "bad-date",
		});
		expect(detectConflictCalled).toBe(false);
		expect(result).toEqual({
			code: "validation",
			message: "Invalid valid_from (must be ISO-8601)",
			retryable: false,
		});
	});
	test("upsert_triple accepts valid_to=infinite without coercing raw input", async () => {
		const handlers = new Map();
		let receivedValidTo = "unset";
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
				detectConflict: async () => null,
				efctRelateConflict: async () => ({}),
				efctUpsertTriple: async (args) => {
					receivedValidTo = args.valid_to;
					return {};
				},
			},
		);
		const handler = handlers.get("upsert_triple");
		expect(handler).toBeDefined();
		await handler({ subject: "S", predicate: "P", object: "O", valid_to: "infinite" });
		expect(receivedValidTo).toBe("infinite");
	});
});
