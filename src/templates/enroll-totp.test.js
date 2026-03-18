/** @implements NFR-001 — Verify enroll-totp template rendering. */
import { describe, test, expect } from "bun:test";
import { renderEnrollTotpPage } from "./enroll-totp.pure.js";
describe("templates/enroll-totp.pure", () => {
	const baseParams = {
		qrSvg: "<svg><rect/></svg>",
		secretDisplay: "JBSW Y3DP EHPK 3PXP",
		enrollNonce: "enonce2",
		csrfToken: "csrf321",
	};
	test("returns non-empty HTML", () => {
		expect(renderEnrollTotpPage(baseParams).length).toBeGreaterThan(100);
	});
	test("contains DOCTYPE", () => {
		expect(renderEnrollTotpPage(baseParams).indexOf("<!DOCTYPE html>")).toBe(0);
	});
	test("contains title", () => {
		expect(renderEnrollTotpPage(baseParams).indexOf("Set Up Two-Factor")).toBeGreaterThan(-1);
	});
	test("contains QR SVG raw (not escaped)", () => {
		const text = renderEnrollTotpPage(baseParams);
		expect(text.indexOf("<svg><rect/></svg>")).toBeGreaterThan(-1);
	});
	test("contains secret display", () => {
		expect(renderEnrollTotpPage(baseParams).indexOf("JBSW Y3DP")).toBeGreaterThan(-1);
	});
	test("contains CSRF token", () => {
		expect(renderEnrollTotpPage(baseParams).indexOf("csrf321")).toBeGreaterThan(-1);
	});
	test("contains verification code input", () => {
		expect(renderEnrollTotpPage(baseParams).indexOf("totp_code")).toBeGreaterThan(-1);
	});
});
