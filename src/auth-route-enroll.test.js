/** @implements FR-018 — Verify enrollment route handler behavior. */
import { describe, expect, test } from "bun:test";
import { createAuthRouteHarness } from "./auth-route-handlers.test-helpers.js";

describe("auth-route-enroll.orch", () => {
	test("handleEnrollPasskey validates CSRF and challenge type", async () => {
		const invalid = createAuthRouteHarness();
		invalid.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "{}",
		});
		expect(await invalid.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set("ks_csrf", "csrf-1");
		expired.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: "{}",
		});
		expect(await expired.createHandlers().handleEnrollPasskey()).toEqual({
			status: 400,
			body: "Enrollment expired. Please start over.",
			kind: "text",
		});
	});

	test("handleEnrollPasskey completes registration when the challenge is valid", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set("ks_csrf", "csrf-1");
		harness.challengeMap.set("nonce-1", {
			type: "registration",
			challenge: "reg-challenge",
			oauthReq: { clientId: "test-client" },
		});
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			registration_response: JSON.stringify({ id: "cred-1" }),
		});
		expect(await harness.createHandlers().handleEnrollPasskey()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});
	});

	test("handleCompletePasskeySkip and handleEnrollTotpRedirect require valid nonce/csrf", async () => {
		const invalid = createAuthRouteHarness();
		expect(await invalid.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 400,
			body: "Invalid request",
			kind: "text",
		});

		const valid = createAuthRouteHarness();
		valid.cookies.set("ks_csrf", "csrf-1");
		valid.setQuery({ nonce: "nonce-1", csrf: "csrf-1" });
		valid.challengeMap.set("nonce-1", {
			type: "authentication",
			challenge: "c",
			oauthReq: { clientId: "test-client" },
		});
		expect(await valid.createHandlers().handleCompletePasskeySkip()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});

		const redirect = createAuthRouteHarness();
		redirect.cookies.set("ks_csrf", "csrf-1");
		redirect.setQuery({ nonce: "nonce-2", csrf: "csrf-1" });
		redirect.challengeMap.set("nonce-2", {
			type: "authentication",
			challenge: "c",
			oauthReq: { clientId: "test-client" },
		});
		const enrollResponse = await redirect.createHandlers().handleEnrollTotpRedirect();
		expect(enrollResponse.status).toBe(200);
		expect(enrollResponse.body).toContain("ABCDEFGHIJKLMNOP");
		expect(redirect.kvWrites.map((entry) => entry.key)).toContain("ks:totp:pending:token-1");
	});

	test("handleEnrollTotp rejects invalid requests and missing pending state", async () => {
		const invalid = createAuthRouteHarness();
		invalid.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await invalid.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Invalid enrollment request",
			kind: "text",
		});

		const expired = createAuthRouteHarness();
		expired.cookies.set("ks_csrf", "csrf-1");
		expired.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await expired.createHandlers().handleEnrollTotp()).toEqual({
			status: 400,
			body: "Enrollment expired. Please start over.",
			kind: "text",
		});
	});

	test("handleEnrollTotp stores the enrolled secret and completes authorization", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set("ks_csrf", "csrf-1");
		await harness.deps.kvPut(
			"ks:totp:pending:nonce-1",
			JSON.stringify({
				secret: "ABCDEFGHIJKLMNOP",
				oauthReq: { clientId: "test-client" },
			}),
		);
		harness.setBody({
			enroll_nonce: "nonce-1",
			csrf_token: "csrf-1",
			totp_code: "123456",
		});
		expect(await harness.createHandlers().handleEnrollTotp()).toEqual({
			status: 302,
			location: "https://client.example/callback?code=ok",
			kind: "redirect",
		});
		expect(harness.kvValues.get("ks:totp:secret")).toBe("ABCDEFGHIJKLMNOP");
	});
});
