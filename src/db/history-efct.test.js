/** @implements NFR-001 — Verify history efct layer: transaction queries and batch execution. */
import { describe, test, expect } from "bun:test";
import {
	queryTransactionRows,
	selectRevertableTransactions,
	executeBatch,
} from "./history.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.test.js";
describe("queryTransactionRows", () => {
	test("returns rows matching WHERE clause", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx1', 'CREATE', 'entry', 'e1', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx2', 'CREATE', 'triple', 't1', '2024-01-01')`,
		);
		const rows = await queryTransactionRows(
			db,
			"SELECT * FROM transactions WHERE entity_type = ? ORDER BY id DESC LIMIT ?",
			["entry", 10],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("tx1");
	});
	test("returns all rows with no filter", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx1', 'CREATE', 'entry', 'e1', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx2', 'CREATE', 'triple', 't1', '2024-01-01')`,
		);
		const rows = await queryTransactionRows(
			db,
			"SELECT * FROM transactions ORDER BY id DESC LIMIT ?",
			[10],
		);
		expect(rows).toHaveLength(2);
	});
});
describe("selectRevertableTransactions", () => {
	test("returns non-reverted non-REVERT transactions", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx1', 'CREATE', 'entry', 'e1', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO transactions (id, op, entity_type, entity_id, created_at) VALUES ('tx2', 'REVERT', 'entry', 'e1', '2024-01-02')`,
		);
		const rows = await selectRevertableTransactions(db, 5);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("tx1");
	});
});
describe("executeBatch", () => {
	test("executes statement descriptors against D1", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO entries (id, topic, content, tags, created_at, updated_at) VALUES ('e1', 't', 'c', '[]', '2024-01-01', '2024-01-01')`,
		);
		await executeBatch(db, [
			{ sql: `UPDATE entries SET deleted_at = ? WHERE id = ?`, binds: ["2024-01-02", "e1"] },
		]);
		const entry = sqlite.prepare("SELECT deleted_at FROM entries WHERE id = ?").get("e1");
		expect(entry.deleted_at).toBe("2024-01-02");
	});
});
