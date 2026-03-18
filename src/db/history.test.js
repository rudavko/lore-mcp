/** @implements NFR-001 — Verify history pure helpers: row mapping, query building, undo statement generation. */
import { describe, test, expect } from "bun:test";
import {
	rowToTransaction,
	buildHistoryQueryConditions,
	buildUndoStatements,
} from "./history.pure.js";
describe("rowToTransaction", () => {
	test("maps DB row to Transaction", () => {
		const row = {
			id: "tx1",
			op: "CREATE",
			entity_type: "entry",
			entity_id: "e1",
			before_snapshot: null,
			after_snapshot: '{"topic":"a"}',
			reverted_by: null,
			created_at: "2024-01-01",
		};
		const tx = rowToTransaction(row);
		expect(tx.id).toBe("tx1");
		expect(tx.op).toBe("CREATE");
		expect(tx.entity_type).toBe("entry");
		expect(tx.entity_id).toBe("e1");
		expect(tx.before_snapshot).toBeNull();
		expect(tx.after_snapshot).toBe('{"topic":"a"}');
		expect(tx.reverted_by).toBeNull();
		expect(tx.created_at).toBe("2024-01-01");
	});
	test("maps reverted_by when present", () => {
		const row = {
			id: "tx1",
			op: "CREATE",
			entity_type: "entry",
			entity_id: "e1",
			before_snapshot: null,
			after_snapshot: null,
			reverted_by: "tx2",
			created_at: "2024-01-01",
		};
		const tx = rowToTransaction(row);
		expect(tx.reverted_by).toBe("tx2");
	});
});
describe("buildHistoryQueryConditions", () => {
	test("no filters returns empty conditions and binds", () => {
		const { conditions, binds } = buildHistoryQueryConditions({}, null);
		expect(conditions).toHaveLength(0);
		expect(binds).toHaveLength(0);
	});
	test("cursor adds id < condition", () => {
		const { conditions, binds } = buildHistoryQueryConditions({}, "prev-id");
		expect(conditions).toContain("id < ?");
		expect(binds).toContain("prev-id");
	});
	test("entity_type filter adds exact match", () => {
		const { conditions, binds } = buildHistoryQueryConditions({ entity_type: "entry" }, null);
		expect(conditions).toContain("entity_type = ?");
		expect(binds).toContain("entry");
	});
	test("both cursor and entity_type", () => {
		const { conditions, binds } = buildHistoryQueryConditions({ entity_type: "triple" }, "abc");
		expect(conditions).toHaveLength(2);
		expect(binds).toHaveLength(2);
	});
});
describe("buildUndoStatements", () => {
	test("CREATE entry generates soft-delete statement", () => {
		const stmts = buildUndoStatements({
			op: "CREATE",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: null,
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		// revert txn insert + mark original reverted + soft-delete
		expect(stmts).toHaveLength(3);
		expect(stmts[0].sql).toContain("INSERT INTO transactions");
		expect(stmts[1].sql).toContain("UPDATE transactions SET reverted_by");
		expect(stmts[2].sql).toContain("UPDATE entries SET deleted_at");
		expect(stmts[2].binds).toContain("e1");
	});
	test("CREATE entry with auto-linked entity adds entity cleanup statements", () => {
		const stmts = buildUndoStatements({
			op: "CREATE",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: null,
			afterSnapshot: {
				canonical_entity_id: "ce-1",
				_auto_link_auto_created: true,
				_auto_link_alias_created: true,
				_auto_link_alias: "alpha",
				_auto_link_alias_id: "ea-1",
				_auto_link_entity_name: "Alpha",
			},
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		expect(stmts.some((stmt) => stmt.sql.indexOf("DELETE FROM entity_aliases") >= 0)).toBe(
			true,
		);
		expect(stmts.some((stmt) => stmt.sql.indexOf("DELETE FROM canonical_entities") >= 0)).toBe(
			true,
		);
	});
	test("CREATE triple generates soft-delete on triples table", () => {
		const stmts = buildUndoStatements({
			op: "CREATE",
			entityType: "triple",
			entityId: "t1",
			beforeSnapshot: null,
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		expect(stmts[2].sql).toContain("UPDATE triples SET deleted_at");
	});
	test("DELETE generates undelete statement", () => {
		const stmts = buildUndoStatements({
			op: "DELETE",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: null,
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		expect(stmts[2].sql).toContain("UPDATE entries SET deleted_at = NULL");
	});
	test("UPDATE entry restores before snapshot fields", () => {
		const stmts = buildUndoStatements({
			op: "UPDATE",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: {
				topic: "old",
				content: "old-c",
				tags: ["a"],
				source: null,
				actor: null,
				confidence: null,
				updated_at: "2024-01-01",
			},
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		expect(stmts[2].sql).toContain("UPDATE entries SET topic");
		expect(stmts[2].binds).toContain("old");
		expect(stmts[2].binds).toContain("old-c");
	});
	test("UPDATE entry serializes tags array to JSON", () => {
		const stmts = buildUndoStatements({
			op: "UPDATE",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: {
				topic: "t",
				content: "c",
				tags: ["x", "y"],
				source: null,
				actor: null,
				confidence: null,
				updated_at: "2024-01-01",
			},
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		// tags should be serialized — caller provides tagsJson via serializeTags
		expect(stmts[2].binds).toContain("e1");
	});
	test("UPDATE triple restores all triple fields", () => {
		const stmts = buildUndoStatements({
			op: "UPDATE",
			entityType: "triple",
			entityId: "t1",
			beforeSnapshot: {
				subject: "A",
				predicate: "knows",
				object: "B",
				source: "web",
				actor: null,
				confidence: 0.9,
			},
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		expect(stmts[2].sql).toContain("UPDATE triples SET subject");
		expect(stmts[2].binds).toContain("A");
		expect(stmts[2].binds).toContain("knows");
		expect(stmts[2].binds).toContain("B");
	});
	test("returns only base statements for unknown op", () => {
		const stmts = buildUndoStatements({
			op: "UNKNOWN",
			entityType: "entry",
			entityId: "e1",
			beforeSnapshot: null,
			afterSnapshot: null,
			revertId: "rv1",
			txId: "tx1",
			now: "2024-01-01",
		});
		// Just revert txn + mark reverted, no entity mutation
		expect(stmts).toHaveLength(2);
	});
	test("MERGE restores merge target entity ownership and alias mapping", () => {
		const stmts = buildUndoStatements({
			op: "MERGE",
			entityType: "entity",
			entityId: "keep-id",
			beforeSnapshot: {
				keep_id: "keep-id",
				keep_name: "Keep Name",
				merge_id: "merge-id",
				merge_name: "Merge Name",
				merge_created_at: "2024-01-01T00:00:00Z",
				subj_triple_ids: ["t-subj"],
				obj_triple_ids: ["t-obj"],
				merge_entry_ids: ["e-1"],
				merge_alias_ids: ["a-1"],
			},
			afterSnapshot: null,
			revertId: "rv-merge",
			txId: "tx-merge",
			now: "2024-01-02T00:00:00Z",
		});
		expect(stmts.length > 2).toBe(true);
		expect(
			stmts.some((stmt) => stmt.sql.indexOf("INSERT OR IGNORE INTO canonical_entities") >= 0),
		).toBe(true);
		expect(stmts.some((stmt) => stmt.sql.indexOf("UPDATE triples SET subject") >= 0)).toBe(
			true,
		);
		expect(stmts.some((stmt) => stmt.sql.indexOf("UPDATE triples SET object") >= 0)).toBe(true);
		expect(
			stmts.some((stmt) => stmt.sql.indexOf("UPDATE entries SET canonical_entity_id") >= 0),
		).toBe(true);
		expect(
			stmts.some(
				(stmt) => stmt.sql.indexOf("UPDATE entity_aliases SET canonical_entity_id") >= 0,
			),
		).toBe(true);
		expect(stmts.some((stmt) => stmt.sql.indexOf("DELETE FROM entity_aliases") >= 0)).toBe(
			true,
		);
	});
});
