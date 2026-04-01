/** @implements NFR-001 — Verify build_info tool response formatting. */
import { describe, test, expect } from "bun:test";
import { handleBuildInfo } from "./tools-core.pure.js";
describe("mcp/tools.pure build_info", () => {
	test("returns version and build hash payload", () => {
		const result = handleBuildInfo(
			{},
			{
				appVersion: "1.2.3",
				buildHash: "abc123def456",
				formatResult: (_text, data) => data,
			},
		);
		expect(result.version).toBe("1.2.3");
		expect(result.build_hash).toBe("abc123def456");
	});
});
