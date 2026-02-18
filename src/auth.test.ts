import { describe, expect, it } from "bun:test";
import app from "./auth";

describe("auth headers", () => {
	it("allows OAuth loopback callbacks in CSP form-action", async () => {
		const res = await app.request("https://example.com/");
		const csp = res.headers.get("Content-Security-Policy") ?? "";

		expect(csp).toContain("form-action 'self' https:");
		expect(csp).toContain("http://127.0.0.1:*");
		expect(csp).toContain("http://localhost:*");
		expect(csp).toContain("http://[::1]:*");
	});
});
