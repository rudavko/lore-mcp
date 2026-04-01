/** @implements NFR-001 — Verify enroll-passkey template rendering. */
import { describe, test, expect } from "bun:test";
import { renderEnrollPasskeyPage } from "./enroll-passkey.pure.js";
describe("templates/enroll-passkey.pure", () => {
	const baseParams = {
		enrollNonce: "enonce1",
		csrfToken: "csrf789",
		optionsJSON: "{}",
		cspNonce: "csp1",
		canSkipPasskey: false,
		canStartTotpEnrollment: false,
	};
	test("contains CSRF token", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("csrf789")).toBeGreaterThan(-1);
	});
	test("contains enroll nonce", () => {
		expect(renderEnrollPasskeyPage(baseParams).indexOf("enonce1")).toBeGreaterThan(-1);
	});
	test("contains TOTP enrollment form when requested", () => {
		const text = renderEnrollPasskeyPage({ ...baseParams, canStartTotpEnrollment: true });
		expect(text.indexOf('<form action="/enroll-totp-redirect" method="POST">')).toBeGreaterThan(-1);
	});
	test("contains skip form when alternate factor is already satisfied", () => {
		const text = renderEnrollPasskeyPage({ ...baseParams, canSkipPasskey: true });
		expect(text.indexOf('<form action="/complete-passkey-skip" method="POST">')).toBeGreaterThan(-1);
		expect(text.indexOf("Skip passkey setup for now")).toBeGreaterThan(-1);
	});
	test("renders both alternate POST actions when both transitions are allowed", () => {
		const text = renderEnrollPasskeyPage({
			...baseParams,
			canSkipPasskey: true,
			canStartTotpEnrollment: true,
		});
		expect(text.indexOf('<form action="/complete-passkey-skip" method="POST">')).toBeGreaterThan(-1);
		expect(text.indexOf('<form action="/enroll-totp-redirect" method="POST">')).toBeGreaterThan(-1);
	});
	test("does not expose nonce and csrf in query links", () => {
		const text = renderEnrollPasskeyPage({
			...baseParams,
			canStartTotpEnrollment: true,
			canSkipPasskey: true,
		});
		expect(text.indexOf("?nonce=")).toBe(-1);
		expect(text.indexOf("&csrf=")).toBe(-1);
		expect(text.indexOf('href="/enroll-totp-redirect')).toBe(-1);
		expect(text.indexOf('href="/complete-passkey-skip')).toBe(-1);
	});
	test("contains navigator.credentials.create script", () => {
		expect(
			renderEnrollPasskeyPage(baseParams).indexOf("navigator.credentials.create"),
		).toBeGreaterThan(-1);
	});
});
