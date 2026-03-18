/** @implements NFR-001 — Verify entry pure helpers: validation, row mapping, query building. */
import { describe, test, expect } from "bun:test";
import {
	validateEntryFields,
	rowToEntry,
	buildEntryObject,
	buildQueryConditions,
} from "./entries.pure.js";
describe("entry validation", () => {
	test("valid params return ok", () => {
		const r = validateEntryFields({ topic: "test", content: "body" });
		expect(r.ok).toBe(true);
	});
	test("topic too long returns error", () => {
		const r = validateEntryFields({ topic: "x".repeat(1001), content: "body" });
		expect(r.ok).toBe(false);
	});
	test("content too long returns error", () => {
		const r = validateEntryFields({ topic: "ok", content: "x".repeat(100_001) });
		expect(r.ok).toBe(false);
	});
	test("invalid validity interval value returns error", () => {
		const r = validateEntryFields({ topic: "ok", content: "body", valid_from: "not-a-date" });
		expect(r.ok).toBe(false);
	});
	test("null validity interval values are accepted for patch operations", () => {
		const r = validateEntryFields({ valid_from: null, valid_to: null });
		expect(r.ok).toBe(true);
	});
	test("valid_to supports infinite sentinel", () => {
		const r = validateEntryFields({ topic: "ok", content: "body", valid_to: "infinite" });
		expect(r.ok).toBe(true);
	});
	test("ttl_seconds must be a positive integer", () => {
		const r = validateEntryFields({ topic: "ok", content: "body", ttl_seconds: 0 });
		expect(r.ok).toBe(false);
	});
	test("assumption requires confidence=null", () => {
		const invalid = validateEntryFields({
			topic: "ok",
			content: "body",
			knowledge_type: "assumption",
			confidence: 0.9,
		});
		expect(invalid.ok).toBe(false);
		const valid = validateEntryFields({
			topic: "ok",
			content: "body",
			knowledge_type: "assumption",
			confidence: null,
		});
		expect(valid.ok).toBe(true);
	});
	test("assumption requires source omission", () => {
		const invalid = validateEntryFields({
			topic: "ok",
			content: "body",
			knowledge_type: "assumption",
			source: "report-1",
		});
		expect(invalid.ok).toBe(false);
		const valid = validateEntryFields({
			topic: "ok",
			content: "body",
			knowledge_type: "assumption",
			source: null,
		});
		expect(valid.ok).toBe(true);
	});
});
describe("rowToEntry", () => {
	test("maps DB row to Entry with pre-parsed tags", () => {
		const row = {
			id: "1",
			topic: "t",
			content: "c",
			tags: '["a"]',
			source: null,
			actor: null,
			confidence: null,
			valid_from: null,
			valid_to: null,
			valid_to_state: "unspecified",
			status: "active",
			knowledge_type: "observation",
			memory_type: "fleeting",
			canonical_entity_id: null,
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
		};
		const entry = rowToEntry(row, ["a"]);
		expect(entry.id).toBe("1");
		expect(entry.tags).toEqual(["a"]);
		expect(entry.valid_to_state).toBe("unspecified");
		expect(entry.knowledge_type).toBe("observation");
		expect(entry.memory_type).toBe("fleeting");
	});
});
describe("buildEntryObject", () => {
	test("creates Entry with defaults", () => {
		const entry = buildEntryObject("id1", { topic: "t", content: "c" }, "2024-01-01");
		expect(entry.id).toBe("id1");
		expect(entry.status).toBe("active");
		expect(entry.knowledge_type).toBe("observation");
		expect(entry.memory_type).toBe("fleeting");
		expect(entry.tags).toEqual([]);
	});
	test("uses provided optional fields", () => {
		const entry = buildEntryObject(
			"id1",
			{ topic: "t", content: "c", tags: ["x"], source: "web" },
			"2024-01-01",
		);
		expect(entry.tags).toEqual(["x"]);
		expect(entry.source).toBe("web");
	});
	test("uses provided validity fields", () => {
		const entry = buildEntryObject(
			"id1",
			{
				topic: "t",
				content: "c",
				valid_from: "2025-01-01T00:00:00.000Z",
				valid_to: "2025-12-31T00:00:00.000Z",
			},
			"2024-01-01",
		);
		expect(entry.valid_from).toBe("2025-01-01T00:00:00.000Z");
		expect(entry.valid_to).toBe("2025-12-31T00:00:00.000Z");
	});
	test("normalizes valid_to=infinite to open-ended null", () => {
		const entry = buildEntryObject(
			"id1",
			{
				topic: "t",
				content: "c",
				valid_to: "infinite",
			},
			"2024-01-01",
		);
		expect(entry.valid_to).toBeNull();
		expect(entry.valid_to_state).toBe("infinite");
	});
	test("omitted valid_to is stored as unspecified", () => {
		const entry = buildEntryObject("id1", { topic: "t", content: "c" }, "2024-01-01");
		expect(entry.valid_to).toBeNull();
		expect(entry.valid_to_state).toBe("unspecified");
	});
	test("keeps provided expires_at", () => {
		const entry = buildEntryObject(
			"id1",
			{
				topic: "t",
				content: "c",
				expires_at: "2026-01-01T00:00:10.000Z",
			},
			"2024-01-01",
		);
		expect(entry.expires_at).toBe("2026-01-01T00:00:10.000Z");
	});
});
describe("buildQueryConditions", () => {
	test("base condition always present", () => {
		const { conditions, binds } = buildQueryConditions({}, null);
		expect(conditions).toContain("deleted_at IS NULL");
		expect(conditions).toContain(
			"(expires_at IS NULL OR datetime(expires_at) > datetime('now') OR (knowledge_type = 'hypothesis' AND status = 'refuted'))",
		);
		expect(binds).toHaveLength(0);
	});
	test("topic filter adds LIKE condition", () => {
		const { conditions, binds } = buildQueryConditions({ topic: "test" }, null);
		expect(conditions.length).toBeGreaterThan(1);
		expect(binds).toHaveLength(1);
	});
	test("cursor adds id < condition", () => {
		const { conditions, binds } = buildQueryConditions({}, "prev-id");
		expect(conditions).toContain("id < ?");
		expect(binds).toContain("prev-id");
	});
	test("as_of adds validity interval filtering", () => {
		const { conditions, binds } = buildQueryConditions(
			{ as_of: "2026-01-15T00:00:00.000Z" },
			null,
		);
		expect(conditions).toContain("(valid_from IS NULL OR datetime(valid_from) <= datetime(?))");
		expect(conditions).toContain("(valid_to IS NULL OR datetime(valid_to) >= datetime(?))");
		expect(binds).toEqual(["2026-01-15T00:00:00.000Z", "2026-01-15T00:00:00.000Z"]);
	});
});
