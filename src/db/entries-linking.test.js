/** @implements FR-001, FR-012 — Verify entry create/update linking and validity normalization behavior. */
import { describe, expect, test } from "bun:test";
import { createEntry, updateEntry } from "./entries.ops.efct.js";
import {
	validateCreateEntryInput,
	resolveCreateAutoLinkState,
	buildCreateSnapshots,
	resolveTopicCanonicalEntityId,
} from "./entries-autolink.efct.js";
const deriveValidToStateFromInput = (value) => {
	if (value === undefined) {
		return { validTo: undefined, validToState: "unspecified" };
	}
	if (value === null) {
		return { validTo: null, validToState: "unspecified" };
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "infinite" || normalized === "infinity" || normalized === "forever") {
		return { validTo: null, validToState: "infinite" };
	}
	return { validTo: value, validToState: "bounded" };
};
describe("db/entries entry-to-entity linking", () => {
	test("createEntry resolves canonical entity id from topic", async () => {
		let insertedCanonicalEntityId = null;
		const entry = await createEntry(
			{
				topic: "Alpha",
				content: "content",
			},
			{
				validateEntryFields: () => ({ ok: true }),
				deriveValidToStateFromInput,
				resolveCanonicalEntityId: async (topic) =>
					topic === "Alpha" ? "entity-alpha" : null,
				buildEntryObject: (id, params, now) => ({
					id,
					topic: params.topic,
					content: params.content,
					tags: [],
					source: null,
					actor: null,
					confidence: null,
					valid_from: null,
					valid_to: null,
					valid_to_state: "unspecified",
					expires_at: null,
					status: "active",
					knowledge_type: "observation",
					memory_type: "fleeting",
					canonical_entity_id: params.canonical_entity_id || null,
					created_at: now,
					updated_at: now,
				}),
				insertEntryRow: async (input) => {
					insertedCanonicalEntityId = input.canonicalEntityId;
				},
				generateId: () => "id-1",
				now: () => "2024-01-01",
				computeExpiresAt: (now, _ttlSeconds) => now,
				serialize: JSON.stringify,
				db: {},
				throwValidation: (_message) => undefined,
				validateCreateEntryInput,
				resolveCreateAutoLinkState,
				buildCreateSnapshots,
				resolveTopicCanonicalEntityId,
			},
		);
		expect(entry.canonical_entity_id).toBe("entity-alpha");
		expect(insertedCanonicalEntityId).toBe("entity-alpha");
	});
	test("updateEntry relinks canonical entity id when topic changes", async () => {
		const entry = await updateEntry(
			"e-1",
			{ topic: "Beta" },
			{
				fetchExistingEntry: async () => ({
					id: "e-1",
					topic: "Alpha",
					content: "content",
					tags: [],
					source: null,
					actor: null,
					confidence: null,
					valid_from: null,
					valid_to: null,
					valid_to_state: "unspecified",
					expires_at: null,
					status: "active",
					knowledge_type: "observation",
					memory_type: "fleeting",
					canonical_entity_id: "entity-alpha",
					created_at: "2024-01-01",
					updated_at: "2024-01-01",
				}),
				resolveCanonicalEntityId: async (topic) =>
					topic === "Beta" ? "entity-beta" : null,
				validateEntryFields: () => ({ ok: true }),
				deriveValidToStateFromInput,
				persistUpdate: async () => {},
				generateId: () => "tx-1",
				now: () => "2024-01-02",
				computeExpiresAt: (now, _ttlSeconds) => now,
				throwValidation: (_message) => undefined,
				validateCreateEntryInput,
				resolveCreateAutoLinkState,
				buildCreateSnapshots,
				resolveTopicCanonicalEntityId,
			},
		);
		expect(entry.topic).toBe("Beta");
		expect(entry.canonical_entity_id).toBe("entity-beta");
	});
	test("updateEntry normalizes valid_to=infinite to null", async () => {
		const entry = await updateEntry(
			"e-1",
			{ valid_to: "infinite" },
			{
				fetchExistingEntry: async () => ({
					id: "e-1",
					topic: "Alpha",
					content: "content",
					tags: [],
					source: null,
					actor: null,
					confidence: null,
					valid_from: "2024-01-01T00:00:00.000Z",
					valid_to: "2024-12-31T00:00:00.000Z",
					valid_to_state: "bounded",
					expires_at: null,
					status: "active",
					knowledge_type: "observation",
					memory_type: "fleeting",
					canonical_entity_id: "entity-alpha",
					created_at: "2024-01-01",
					updated_at: "2024-01-01",
				}),
				resolveCanonicalEntityId: async () => "entity-alpha",
				validateEntryFields: () => ({ ok: true }),
				deriveValidToStateFromInput,
				persistUpdate: async () => {},
				generateId: () => "tx-1",
				now: () => "2024-01-02",
				computeExpiresAt: (now, _ttlSeconds) => now,
				throwValidation: (_message) => undefined,
				validateCreateEntryInput,
				resolveCreateAutoLinkState,
				buildCreateSnapshots,
				resolveTopicCanonicalEntityId,
			},
		);
		expect(entry.valid_to).toBeNull();
		expect(entry.valid_to_state).toBe("infinite");
	});
	test("createEntry with ttl_seconds sets expires_at", async () => {
		const entry = await createEntry(
			{
				topic: "Alpha",
				content: "content",
				ttl_seconds: 5,
			},
			{
				validateEntryFields: () => ({ ok: true }),
				deriveValidToStateFromInput,
				resolveCanonicalEntityId: async () => null,
				buildEntryObject: (id, params, now) => ({
					id,
					topic: params.topic,
					content: params.content,
					tags: [],
					source: null,
					actor: null,
					confidence: null,
					valid_from: null,
					valid_to: null,
					valid_to_state: "unspecified",
					expires_at: params.expires_at,
					status: "active",
					knowledge_type: "observation",
					memory_type: "fleeting",
					canonical_entity_id: null,
					created_at: now,
					updated_at: now,
				}),
				insertEntryRow: async () => {},
				generateId: () => "id-1",
				now: () => "2026-01-01T00:00:00.000Z",
				computeExpiresAt: (_now, ttlSeconds) => `2026-01-01T00:00:0${ttlSeconds}.000Z`,
				serialize: JSON.stringify,
				db: {},
				throwValidation: (_message) => undefined,
				validateCreateEntryInput,
				resolveCreateAutoLinkState,
				buildCreateSnapshots,
				resolveTopicCanonicalEntityId,
			},
		);
		expect(entry.expires_at).toBe("2026-01-01T00:00:05.000Z");
	});
});
