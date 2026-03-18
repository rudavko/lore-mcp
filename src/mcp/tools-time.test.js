/** @implements NFR-005 — Verify time tool usability behavior for timezone formatting and validation. */
import { describe, expect, test } from "bun:test";
import { handleTime } from "./tools.pure.js";
describe("mcp/tools.pure time", () => {
	test("applies timezone to returned timestamp", () => {
		const deps = {
			dateNow: () => "2026-03-04T10:00:00.000Z",
			timeNowForTimezone: (timezone, _now) =>
				timezone === "UTC" ? "2026-03-04T10:00:00" : "2026-03-04T11:00:00",
			validateTimezone: (_timezone) => true,
			formatResult: (text, data) => ({ text, data }),
		};
		const utc = handleTime({ timezone: "UTC" }, deps);
		const zurich = handleTime({ timezone: "Europe/Zurich" }, deps);
		const utcTs = utc.text.split(" (")[0];
		const zurichTs = zurich.text.split(" (")[0];
		expect(utcTs).not.toBe(zurichTs);
	});
	test("rejects invalid timezone", () => {
		const result = handleTime(
			{ timezone: "Mars/Olympus" },
			{
				dateNow: () => "2026-03-04T10:00:00.000Z",
				validateTimezone: (_timezone) => false,
				formatError: (error) => error,
				formatResult: (text) => ({ text }),
			},
		);
		expect(result).toEqual({
			code: "validation",
			message: "Invalid timezone",
			retryable: false,
		});
	});
});
