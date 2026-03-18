/** @implements NFR-001 — Verify enroll-passkey template rendering. */
import { describe, test, expect } from "bun:test";
import { renderEnrollPasskeyPage } from "./enroll-passkey.pure.js";
describe("templates/enroll-passkey.pure", () => {
	const baseParams = {
		enrollNonce: "enonce1",
		csrfToken: "csrf789",
		optionsJSON: "{}",
		cspNonce: "csp1",
		totpEnrolled: false,
	};
	test("returns non-empty HTML", () => {
		expect(renderEnrollPasskeyPage(baseParams).length).toBeGreaterThan(100);
	});
	test("contains DOCTYPE", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("<!DOCTYPE html>")).toBe(0);
	});
	test("contains title", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("Set Up Passkey")).toBeGreaterThan(-1);
	});
	test("contains CSRF token", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("csrf789")).toBeGreaterThan(-1);
	});
	test("contains enroll nonce", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("enonce1")).toBeGreaterThan(-1);
	});
	test("contains skip link when totp not enrolled", () => {
		expect(
			renderEnrollPasskeyPage(baseParams).indexOf("authenticator code instead"),
		).toBeGreaterThan(-1);
	});
	test("contains skip link when totp enrolled", () => {
		const text = renderEnrollPasskeyPage({ ...baseParams, totpEnrolled: true });
		expect(text.indexOf("Skip")).toBeGreaterThan(-1);
	});
	test("contains navigator.credentials.create script", () => {
		expect(
			renderEnrollPasskeyPage(baseParams).indexOf("navigator.credentials.create"),
		).toBeGreaterThan(-1);
	});
});
