/** @implements NFR-001 — Verify conflict efct layer: save, load, remove pending conflicts. */
import { describe, test, expect } from "bun:test";
import {
	savePendingConflictRow,
	loadPendingConflictRow,
	removePendingConflictRow,
	sweepExpiredConflicts,
} from "./conflicts.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
describe("savePendingConflictRow", () => {
	test("inserts conflict row with scope and data", async () => {
		const { sqlite, db } = await createInitializedD1();
		await savePendingConflictRow({
			db,
			conflictId: "c1",
			scope: "subject+predicate",
			dataJson: '{"conflict_id":"c1"}',
			expiresAt: "2024-12-31T23:59:59Z",
			createdAt: "2024-01-01T00:00:00Z",
		});
		const row = sqlite.prepare("SELECT * FROM conflicts WHERE conflict_id = ?").get("c1");
		expect(row.scope).toBe("subject+predicate");
		expect(row.data).toBe('{"conflict_id":"c1"}');
		expect(typeof row.created_at).toBe("string");
		expect(row.expires_at).toBe("2024-12-31T23:59:59Z");
	});
});
describe("loadPendingConflictRow", () => {
	test("returns row for non-expired conflict", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES ('c1', 'test', '{"data":1}', '2024-01-01T00:00:00Z', '2099-01-01T00:00:00Z')`,
		);
		const row = await loadPendingConflictRow(db, "c1", "2024-01-01T00:00:00Z");
		expect(row).not.toBeNull();
		expect(row.data).toBe('{"data":1}');
	});
	test("returns null for expired conflict", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES ('c1', 'test', '{"data":1}', '2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
		);
		const row = await loadPendingConflictRow(db, "c1", "2024-01-01T00:00:00Z");
		expect(row).toBeNull();
	});
});
describe("removePendingConflictRow", () => {
	test("deletes conflict by id", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES ('c1', 'test', '{}', '2024-01-01T00:00:00Z', '2099-01-01T00:00:00Z')`,
		);
		await removePendingConflictRow(db, "c1");
		const row = sqlite.prepare("SELECT * FROM conflicts WHERE conflict_id = ?").get("c1");
		expect(row).toBeFalsy();
	});
});
describe("sweepExpiredConflicts", () => {
	test("removes expired conflicts", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES ('c1', 'test', '{}', '2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
		);
		sqlite.exec(
			`INSERT INTO conflicts (conflict_id, scope, data, created_at, expires_at) VALUES ('c2', 'test', '{}', '2024-01-01T00:00:00Z', '2099-01-01T00:00:00Z')`,
		);
		await sweepExpiredConflicts(db, "2024-01-01T00:00:00Z");
		const rows = sqlite.prepare("SELECT * FROM conflicts").all();
		expect(rows).toHaveLength(1);
	});
});
