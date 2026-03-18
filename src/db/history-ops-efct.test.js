/** @implements FR-008 — Verify history orchestration paginates results and replays transaction reverts through injected deps. */
import { describe, expect, test } from "bun:test";
import { getHistory, undoTransactions } from "./history.ops.efct.js";

describe("db/history.ops.efct", () => {
	test("undoTransactions returns empty list when there is nothing to revert", async () => {
		const reverted = await undoTransactions(10, {
			db: "db-handle",
			selectRevertableTransactions: async () => [],
		});

		expect(reverted).toEqual([]);
	});

	test("undoTransactions reverts each selected transaction with generated id and timestamp", async () => {
		const revertedCalls = [];
		let nextId = 0;
		const reverted = await undoTransactions(2, {
			db: "db-handle",
			selectRevertableTransactions: async () => [{ id: "tx-1" }, { id: "tx-2" }],
			rowToTransaction: (row) => ({ id: row.id, kind: "tx" }),
			generateId: () => {
				nextId += 1;
				return `revert-${nextId}`;
			},
			now: () => "2026-03-14T10:00:00.000Z",
			revertTransaction: async (...args) => {
				revertedCalls.push(args);
			},
		});

		expect(reverted).toEqual([
			{ id: "tx-1", kind: "tx" },
			{ id: "tx-2", kind: "tx" },
		]);
		expect(revertedCalls).toEqual([
			[{ id: "tx-1", kind: "tx" }, "revert-1", "2026-03-14T10:00:00.000Z"],
			[{ id: "tx-2", kind: "tx" }, "revert-2", "2026-03-14T10:00:00.000Z"],
		]);
	});

	test("getHistory paginates and emits next_cursor when more rows are available", async () => {
		const result = await getHistory(
			{ limit: 2, cursor: "encoded-cursor" },
			{
				db: "db-handle",
				decodeCursor: (cursor) => `decoded:${cursor}`,
				buildSql: (params, cursor, limit) => ({
					sql: `sql:${params.limit}:${cursor}:${limit}`,
					binds: [cursor, limit],
				}),
				queryTransactionRows: async () => [
					{ id: "tx-1" },
					{ id: "tx-2" },
					{ id: "tx-3" },
				],
				rowToTransaction: (row) => ({ id: row.id, mapped: true }),
				encodeCursor: (id) => `cursor:${id}`,
			},
		);

		expect(result).toEqual({
			items: [
				{ id: "tx-1", mapped: true },
				{ id: "tx-2", mapped: true },
			],
			next_cursor: "cursor:tx-2",
		});
	});

	test("getHistory omits next_cursor on the final page", async () => {
		const result = await getHistory(
			{ limit: 2 },
			{
				db: "db-handle",
				decodeCursor: () => null,
				buildSql: () => ({ sql: "sql", binds: [] }),
				queryTransactionRows: async () => [{ id: "tx-1" }],
				rowToTransaction: (row) => row,
				encodeCursor: (id) => `cursor:${id}`,
			},
		);

		expect(result).toEqual({
			items: [{ id: "tx-1" }],
			next_cursor: null,
		});
	});
});
