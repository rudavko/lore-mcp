/** @implements FR-001 — Verify conflict-row orchestration delegates serialization, timestamps, and storage correctly. */
import { describe, expect, test } from "bun:test";
import {
	makeLoadConflictRow,
	makeRemoveConflict,
	makeSaveConflict,
} from "./conflicts.ops.efct.js";

describe("db/conflicts.ops.efct", () => {
	test("saveConflict serializes and persists with computed expiry", async () => {
		const calls = [];
		const saveConflict = makeSaveConflict({
			db: "db-handle",
			serialize: (value) => JSON.stringify(value),
			now: () => "2026-03-14T10:00:00.000Z",
			computeExpiresAt: (createdAt, ttlMs) => `${createdAt}+${ttlMs}`,
			conflictTtlMs: 60000,
			savePendingConflictRow: async (...args) => {
				calls.push(args);
			},
		});

		const conflict = { conflict_id: "c-1", scope: "entry", value: "payload" };
		await saveConflict(conflict);

		expect(calls).toEqual([
			[{
				db: "db-handle",
				conflictId: "c-1",
				scope: "entry",
				dataJson: '{"conflict_id":"c-1","scope":"entry","value":"payload"}',
				expiresAt: "2026-03-14T10:00:00.000Z+60000",
				createdAt: "2026-03-14T10:00:00.000Z",
			}],
		]);
	});

	test("loadConflictRow reads by id with current time", async () => {
		const calls = [];
		const loadConflictRow = makeLoadConflictRow({
			db: "db-handle",
			now: () => "2026-03-14T10:00:00.000Z",
			loadPendingConflictRow: async (...args) => {
				calls.push(args);
				return { id: "c-1" };
			},
		});

		const row = await loadConflictRow("c-1");

		expect(row).toEqual({ id: "c-1" });
		expect(calls).toEqual([["db-handle", "c-1", "2026-03-14T10:00:00.000Z"]]);
	});

	test("removeConflict delegates delete to storage layer", async () => {
		const calls = [];
		const removeConflict = makeRemoveConflict({
			db: "db-handle",
			removePendingConflictRow: async (...args) => {
				calls.push(args);
			},
		});

		await removeConflict("c-1");

		expect(calls).toEqual([["db-handle", "c-1"]]);
	});
});
