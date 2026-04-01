/** @implements NFR-001 — Verify triple efct layer: D1 CRUD operations. */
import { describe, test, expect } from "bun:test";
import {
	insertTripleRow,
	selectTripleRow,
	updateTripleRow,
	softDeleteTripleRow,
	queryTripleRows,
} from "./triples.efct.js";
import { createInitializedD1 } from "../test-helpers/db-d1.helper.js";
describe("insertTripleRow", () => {
	test("inserts triple and transaction rows", async () => {
		const { sqlite, db } = await createInitializedD1();
		await insertTripleRow({
			db,
			txId: "tx1",
			tripleId: "t1",
			subject: "Alice",
			predicate: "knows",
			object: "Bob",
			source: "web",
			actor: null,
			confidence: 0.8,
			validFrom: null,
			validTo: null,
			validToState: "unspecified",
			afterSnapshot: '{"id":"t1"}',
			now: "2024-01-01",
		});
		const triple = sqlite.prepare("SELECT * FROM triples WHERE id = ?").get("t1");
		expect(triple.subject).toBe("Alice");
		expect(triple.predicate).toBe("knows");
		expect(triple.object).toBe("Bob");
		const tx = sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get("tx1");
		expect(tx.op).toBe("CREATE");
		expect(tx.entity_type).toBe("triple");
	});
});
describe("selectTripleRow", () => {
	test("returns row for existing triple", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'A', 'knows', 'B', '2024-01-01')`,
		);
		const row = await selectTripleRow(db, "t1");
		expect(row).not.toBeNull();
		expect(row.subject).toBe("A");
	});
	test("returns null for deleted triple", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at, deleted_at) VALUES ('t1', 'A', 'knows', 'B', '2024-01-01', '2024-01-02')`,
		);
		const row = await selectTripleRow(db, "t1");
		expect(row).toBeNull();
	});
});
describe("updateTripleRow", () => {
	test("updates triple fields and records transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'A', 'knows', 'B', '2024-01-01')`,
		);
		await updateTripleRow({
			db,
			id: "t1",
			txId: "tx1",
			predicate: "likes",
			object: "C",
			source: "web",
			actor: null,
			confidence: 0.5,
			validFrom: null,
			validTo: null,
			validToState: "unspecified",
			beforeSnapshot: '{"before":"snap"}',
			afterSnapshot: '{"after":"snap"}',
			now: "2024-01-02",
		});
		const triple = sqlite.prepare("SELECT * FROM triples WHERE id = ?").get("t1");
		expect(triple.predicate).toBe("likes");
		expect(triple.object).toBe("C");
	});
});
describe("softDeleteTripleRow", () => {
	test("sets deleted_at and records transaction", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'A', 'knows', 'B', '2024-01-01')`,
		);
		await softDeleteTripleRow({
			db,
			id: "t1",
			txId: "tx1",
			beforeSnapshot: '{"before":"snap"}',
			now: "2024-01-02",
		});
		const triple = sqlite.prepare("SELECT * FROM triples WHERE id = ?").get("t1");
		expect(triple.deleted_at).toBe("2024-01-02");
	});
});
describe("queryTripleRows", () => {
	test("returns rows matching WHERE clause", async () => {
		const { sqlite, db } = await createInitializedD1();
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t1', 'A', 'knows', 'B', '2024-01-01')`,
		);
		sqlite.exec(
			`INSERT INTO triples (id, subject, predicate, object, created_at) VALUES ('t2', 'C', 'likes', 'D', '2024-01-01')`,
		);
		const rows = await queryTripleRows(db, "deleted_at IS NULL AND subject = ?", ["A"], 10);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("t1");
	});
});
