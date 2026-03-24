/** @implements FR-011 — Verify platform-agnostic app assembly builds LoreMcp and default handler together. */
import { describe, expect, test } from "bun:test";
import { createLoreMcpApp } from "./index-app-services.orch.2.js";

describe("index-app-services", () => {
	test("assembles LoreMcp, defaultHandlerFetch, and runtime services", () => {
		const app = createLoreMcpApp(globalThis);

		expect(typeof app.LoreMcp).toBe("function");
		expect(typeof app.defaultHandlerFetch).toBe("function");
		expect(typeof app.configureLoreServer).toBe("function");
		expect(typeof app.initLoreMcp).toBe("function");
		expect(typeof app.processLoreIngestion).toBe("function");
		expect(typeof app.runIngestion).toBe("function");
		expect(app.std).toBeTruthy();
	});
});
