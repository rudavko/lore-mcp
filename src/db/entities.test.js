/** @implements NFR-001 — Verify entity pure helpers: row mapping, object building, merge snapshot. */
import { describe, test, expect } from "bun:test";
import {
	rowToEntity,
	rowToAlias,
	buildEntityObject,
	buildAliasObject,
	buildMergeSnapshot,
} from "./entities.pure.js";
describe("rowToEntity", () => {
	test("maps DB row to CanonicalEntity", () => {
		const row = { id: "e1", name: "Alice", created_at: "2024-01-01" };
		const entity = rowToEntity(row);
		expect(entity.id).toBe("e1");
		expect(entity.name).toBe("Alice");
		expect(entity.created_at).toBe("2024-01-01");
	});
});
describe("rowToAlias", () => {
	test("maps DB row to EntityAlias", () => {
		const row = {
			id: "a1",
			alias: "alice",
			canonical_entity_id: "e1",
			created_at: "2024-01-01",
		};
		const alias = rowToAlias(row);
		expect(alias.id).toBe("a1");
		expect(alias.alias).toBe("alice");
		expect(alias.canonical_entity_id).toBe("e1");
	});
});
describe("buildEntityObject", () => {
	test("creates CanonicalEntity", () => {
		const entity = buildEntityObject("e1", "Alice", "2024-01-01");
		expect(entity.id).toBe("e1");
		expect(entity.name).toBe("Alice");
		expect(entity.created_at).toBe("2024-01-01");
	});
});
describe("buildAliasObject", () => {
	test("creates EntityAlias with lowercased alias", () => {
		const alias = buildAliasObject("a1", "Alice", "e1", "2024-01-01");
		expect(alias.alias).toBe("alice");
		expect(alias.canonical_entity_id).toBe("e1");
	});
	test("preserves already lowercase alias", () => {
		const alias = buildAliasObject("a1", "bob", "e1", "2024-01-01");
		expect(alias.alias).toBe("bob");
	});
});
describe("buildMergeSnapshot", () => {
	test("produces before-snapshot for merge undo", () => {
		const snap = buildMergeSnapshot({
			keepId: "k1",
			keepName: "Alice",
			mergeId: "m1",
			mergeName: "Bob",
			mergeCreatedAt: "2024-01-01",
			subjTripleIds: ["t1", "t2"],
			objTripleIds: ["t3"],
			mergeEntryIds: ["e1"],
			mergeAliasIds: ["a1", "a2"],
		});
		expect(snap.keep_id).toBe("k1");
		expect(snap.keep_name).toBe("Alice");
		expect(snap.merge_id).toBe("m1");
		expect(snap.merge_name).toBe("Bob");
		expect(snap.merge_created_at).toBe("2024-01-01");
		expect(snap.subj_triple_ids).toEqual(["t1", "t2"]);
		expect(snap.obj_triple_ids).toEqual(["t3"]);
		expect(snap.merge_entry_ids).toEqual(["e1"]);
		expect(snap.merge_alias_ids).toEqual(["a1", "a2"]);
	});
});
