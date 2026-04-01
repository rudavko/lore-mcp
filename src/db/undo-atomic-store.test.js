/** @implements FR-007, FR-015 — Regression: undo(count=1) reverts store+auto-link as one logical action. */
import { describe, expect, test } from "bun:test";
import { buildUndoStatements, rowToTransaction } from "./history.pure.js";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
describe("undo atomicity for store auto-link", () => {
	test("single revertable transaction undoes entry + auto-linked entity/alias", async () => {
		const { sqlite } = await createInitializedD1();
		const afterSnapshot = JSON.stringify({
			id: "e-store-1",
			topic: "Alpha",
			content: "content",
			canonical_entity_id: "ce-alpha",
			_auto_link_entity_created: true,
			_auto_link_alias_created: true,
			_auto_link_alias: "alpha",
			_auto_link_alias_id: "ea-alpha",
		});
		sqlite
			.prepare(`INSERT INTO entries (
				id, topic, content, tags, source, actor, confidence,
				valid_from, valid_to, valid_to_state, expires_at, status,
				knowledge_type, memory_type, canonical_entity_id,
				created_at, updated_at, deleted_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(
				"e-store-1",
				"Alpha",
				"content",
				"[]",
				null,
				null,
				null,
				null,
				null,
				"unspecified",
				null,
				"active",
				"observation",
				"fleeting",
				"ce-alpha",
				"2026-03-05T10:00:00.000Z",
				"2026-03-05T10:00:00.000Z",
				null,
			);
		sqlite
			.prepare(`INSERT INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`)
			.run("ce-alpha", "Alpha", "2026-03-05T10:00:00.000Z");
		sqlite
			.prepare(
				`INSERT INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`,
			)
			.run("ea-alpha", "alpha", "ce-alpha", "2026-03-05T10:00:00.000Z");
		sqlite
			.prepare(`INSERT INTO transactions (id, op, entity_type, entity_id, before_snapshot, after_snapshot, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.run(
				"tx-store-1",
				"CREATE",
				"entry",
				"e-store-1",
				null,
				afterSnapshot,
				"2026-03-05T10:00:00.000Z",
			);
		const txRows = sqlite.prepare("SELECT COUNT(*) AS c FROM transactions").get();
		expect(txRows.c).toBe(1);
		const revertable = sqlite
			.prepare(`SELECT *
			 FROM transactions
			 WHERE reverted_by IS NULL
			 ORDER BY created_at DESC, id DESC
			 LIMIT 1`)
			.all();
		expect(revertable).toHaveLength(1);
		const tx = rowToTransaction(revertable[0]);
		const undoStatements = buildUndoStatements({
			op: tx.op,
			entityType: tx.entity_type,
			entityId: tx.entity_id,
			beforeSnapshot: tx.before_snapshot ? JSON.parse(tx.before_snapshot) : null,
			afterSnapshot: tx.after_snapshot ? JSON.parse(tx.after_snapshot) : null,
			revertId: "tx-revert-1",
			txId: tx.id,
			now: "2026-03-05T10:01:00.000Z",
		});
		for (let i = 0; i < undoStatements.length; i++) {
			sqlite.prepare(undoStatements[i].sql).run(...undoStatements[i].binds);
		}
		const entry = sqlite
			.prepare("SELECT deleted_at FROM entries WHERE id = ?")
			.get("e-store-1");
		expect(entry.deleted_at).toBe("2026-03-05T10:01:00.000Z");
		const alias = sqlite
			.prepare("SELECT COUNT(*) AS c FROM entity_aliases WHERE id = ?")
			.get("ea-alpha");
		expect(alias.c).toBe(0);
		const entity = sqlite
			.prepare("SELECT COUNT(*) AS c FROM canonical_entities WHERE id = ?")
			.get("ce-alpha");
		expect(entity.c).toBe(0);
	});
});
