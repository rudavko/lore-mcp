/** @implements NFR-001 — Verify observation logging serializes payloads and falls back safely on stringify failure. */
import { describe, expect, test } from "bun:test";
import { logEvent } from "./observe.efct.js";

describe("lib/observe.efct", () => {
	test("logs serialized payload when stringify succeeds", () => {
		const entries = [];
		logEvent(
			(value) => {
				entries.push(value);
			},
			{ event: "mutation", ok: true },
			{
				json: {
					stringify: () => ({ ok: true, value: '{"event":"mutation","ok":true}' }),
				},
			},
		);
		expect(entries).toEqual(['{"event":"mutation","ok":true}']);
	});

	test("logs fallback payload when stringify fails", () => {
		const entries = [];
		logEvent(
			(value) => {
				entries.push(value);
			},
			{ event: "mutation", ok: false },
			{
				json: {
					stringify: () => ({ ok: false }),
				},
			},
		);
		expect(entries).toEqual(['{"event":"log_serialize_error"}']);
	});
});
