/** @implements NFR-001 — Verify scheduling decision constants and pure threshold logic. */
import { describe, expect, test } from "bun:test";
import { _MODULE, RESCHEDULE_DELAY_MS, shouldReschedule } from "./schedule.pure.js";

describe("wiring/schedule.pure", () => {
	test("exports the expected module sentinel", () => {
		expect(_MODULE).toBe("schedule.pure");
	});

	test("uses a one-second reschedule delay", () => {
		expect(RESCHEDULE_DELAY_MS).toBe(1000);
	});

	test("reschedules only when work remains", () => {
		expect(shouldReschedule(1)).toBe(true);
		expect(shouldReschedule(0)).toBe(false);
		expect(shouldReschedule(-1)).toBe(false);
	});
});
