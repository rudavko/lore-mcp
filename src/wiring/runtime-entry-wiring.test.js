/** @implements FR-002 — Verify runtime entry wiring forwards required create-entry orchestration deps. */
import { describe, expect, test } from "bun:test";

import { buildEntryAndTripleOps } from "./runtime.orch.1.js";

describe("wiring/runtime.efct entry wiring", () => {
	test("createEntry forwards create-entry orchestration dependencies", async () => {
		const validateCreateEntryInput = () => undefined;
		const resolveCreateAutoLinkState = async () => ({
			canonical_entity_id: null,
			auto_link_entity: null,
			auto_link_alias: null,
		});
		const resolveTopicCanonicalEntityId = async () => null;
		const buildCreateSnapshots = () => ({ beforeSnapshot: null, afterSnapshot: null });
		const calls = [];
		const existingRow = {
			id: "entry-1",
			topic: "topic",
			content: "content",
			tags: "[]",
			knowledge_type: "observation",
			memory_type: "fleeting",
			status: "active",
		};
		const ops = buildEntryAndTripleOps({
			db: {},
			std: {
				Math,
				Date,
				Number,
				String,
				Array,
				json: {
					parse: (value) => {
						try {
							return { ok: true, value: JSON.parse(value) };
						} catch {
							return { ok: false, value: null };
						}
					},
				},
			},
			generateId: () => "id-1",
			resolveCanonicalEntityIdForCreate: async () => null,
			resolveCanonicalEntityId: async () => null,
			entriesOrchCreate: async (_params, deps) => {
				calls.push(deps);
				return { id: "entry-1", topic: "topic", content: "content" };
			},
			entriesOrchUpdate: async (_id, _params, deps) => {
				calls.push(deps);
				return { id: "entry-1", topic: "topic-updated", content: "content-updated" };
			},
			entriesOrchDelete: async () => {
				throw new Error("unused");
			},
			entriesOrchQuery: async () => {
				throw new Error("unused");
			},
			triplesOrchCreate: async () => {
				throw new Error("unused");
			},
			triplesOrchUpdate: async () => {
				throw new Error("unused");
			},
			triplesOrchUpsert: async () => {
				throw new Error("unused");
			},
			triplesOrchDelete: async () => {
				throw new Error("unused");
			},
			triplesOrchQuery: async () => {
				throw new Error("unused");
			},
			triplesOrchFindActive: async () => {
				throw new Error("unused");
			},
			validateEntryFields: () => ({ ok: true }),
			validateCreateEntryInput,
			deriveValidToStateFromInput: () => "unspecified",
			resolveCreateAutoLinkState,
			resolveTopicCanonicalEntityId,
			buildCreateSnapshots,
			buildEntryObject: () => ({}),
			insertEntryRow: async () => undefined,
			selectEntryRow: async () => existingRow,
			updateEntryRow: async () => undefined,
			softDeleteEntryRow: async () => undefined,
			queryEntryRows: async () => [],
			buildEntryQueryConditions: () => ({ whereClause: "", binds: [] }),
			rowToEntry: (row) => row,
			validateTripleFields: () => ({ ok: true }),
			isKnowledgeType: (value) =>
				[
					"observation",
					"fact",
					"hypothesis",
					"assumption",
					"decision",
					"lesson",
					"evidence",
				].includes(value),
			isPromotionPredicate: () => false,
			isCompatiblePromotionEdge: () => true,
			promotionPredicates: [],
			deriveValidToStateFromInputForTriple: () => "unspecified",
			buildTripleObject: () => ({}),
			insertTripleRow: async () => undefined,
			selectTripleRow: async () => null,
			updateTripleRow: async () => undefined,
			softDeleteTripleRow: async () => undefined,
			queryTripleRows: async () => [],
			buildTripleQueryConditions: () => ({ whereClause: "", binds: [] }),
			rowToTriple: (row) => row,
		});

		const entry = await ops.createEntry({
			topic: "topic",
			content: "content",
		});

		expect(entry.id).toBe("entry-1");
		expect(calls).toHaveLength(1);
		expect(calls[0].validateCreateEntryInput).toBe(validateCreateEntryInput);
		expect(calls[0].resolveCreateAutoLinkState).toBe(resolveCreateAutoLinkState);
		expect(calls[0].buildCreateSnapshots).toBe(buildCreateSnapshots);

		const updated = await ops.updateEntry("entry-1", {
			topic: "topic-updated",
			content: "content-updated",
		});

		expect(updated.id).toBe("entry-1");
		expect(calls).toHaveLength(2);
		expect(calls[1].resolveTopicCanonicalEntityId).toBe(resolveTopicCanonicalEntityId);
	});
});
