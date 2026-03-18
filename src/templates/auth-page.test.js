/** @implements NFR-001 — Verify auth page template rendering. */
import { describe, test, expect } from "bun:test";
import { renderAuthPage } from "./auth-page.pure.js";
describe("templates/auth-page.pure", () => {
	const baseParams = {
		requestNonce: "nonce123",
		csrfToken: "csrf456",
		clientName: "TestApp",
		clientUri: "https://example.com",
		scopes: "read write",
		totpEnrolled: false,
		passkeyEnrolled: false,
		passkeyOnly: false,
	};
	test("returns non-empty HTML", () => {
		const text = renderAuthPage(baseParams);
		expect(text.length).toBeGreaterThan(100);
	});
	test("contains DOCTYPE", () => {
		const text = renderAuthPage(baseParams);
		expect(text.indexOf("<!DOCTYPE html>")).toBe(0);
	});
	test("contains title", () => {
		const text = renderAuthPage(baseParams);
		expect(text.indexOf("Authorize")).toBeGreaterThan(-1);
	});
	test("contains CSRF token", () => {
		const text = renderAuthPage(baseParams);
		expect(text.indexOf("csrf456")).toBeGreaterThan(-1);
	});
	test("contains client name", () => {
		const text = renderAuthPage(baseParams);
		expect(text.indexOf("TestApp")).toBeGreaterThan(-1);
	});
	test("escapes HTML in client name", () => {
		const text = renderAuthPage({ ...baseParams, clientName: "<script>alert(1)</script>" });
		expect(text.indexOf("<script>alert")).toBe(-1);
		expect(text.indexOf("&lt;script&gt;")).toBeGreaterThan(-1);
	});
	test("contains passphrase field when not passkeyOnly", () => {
		const text = renderAuthPage(baseParams);
		expect(text.indexOf("passphrase")).toBeGreaterThan(-1);
	});
	test("contains spinner when passkeyOnly", () => {
		const text = renderAuthPage({
			...baseParams,
			passkeyOnly: true,
			authOptionsJSON: "{}",
			cspNonce: "n1",
		});
		expect(text.indexOf("spinner")).toBeGreaterThan(-1);
	});
	test("contains TOTP field when totpEnrolled", () => {
		const text = renderAuthPage({ ...baseParams, totpEnrolled: true });
		expect(text.indexOf("totp_code")).toBeGreaterThan(-1);
	});
	test("uses rawId-encoded value for both id and rawId in WebAuthn payload", () => {
		const text = renderAuthPage({
			...baseParams,
			passkeyOnly: true,
			authOptionsJSON: "{}",
			cspNonce: "n1",
		});
		expect(text.indexOf("id:b64e(cred.rawId),rawId:b64e(cred.rawId)")).toBeGreaterThan(-1);
		expect(text.indexOf("id:cred.id,rawId:b64e(cred.rawId)")).toBe(-1);
	});
});
