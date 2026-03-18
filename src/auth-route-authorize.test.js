/** @implements FR-018, FR-011 — Verify authorize route handler behavior. */
import { describe, expect, test } from "bun:test";
import { createAuthRouteHarness } from "./auth-route-handlers.test-helpers.js";
import { extractHiddenInputValue } from "./test-helpers/html-scrape.test.js";

describe("auth-route-authorize.orch", () => {
	test("handleAuthorize fails when access passphrase is missing", async () => {
		const harness = createAuthRouteHarness({ accessPassphrase: "" });
		expect(await harness.createHandlers().handleAuthorize()).toEqual({
			status: 500,
			body: "Server misconfigured: ACCESS_PASSPHRASE is required.",
			kind: "text",
		});
	});

	test("handleAuthorize rejects invalid auth requests and missing clients", async () => {
		const parseFailure = createAuthRouteHarness({
			parseAuthRequest: async () => {
				throw new Error("bad request");
			},
		});
		expect(await parseFailure.createHandlers().handleAuthorize()).toEqual({
			status: 400,
			body: "Invalid authorization request",
			kind: "text",
		});

		const missingClient = createAuthRouteHarness({
			lookupClient: async () => null,
		});
		expect(await missingClient.createHandlers().handleAuthorize()).toEqual({
			status: 400,
			body: "Invalid authorization request",
			kind: "text",
		});
	});

	test("handleAuthorize returns a 500 when client lookup wiring fails", async () => {
		const harness = createAuthRouteHarness({
			lookupClient: async () => {
				throw new Error("OAuth client lookup failed.");
			},
		});
		expect(await harness.createHandlers().handleAuthorize()).toEqual({
			status: 500,
			body: "Internal auth error: OAuth client lookup failed.",
			kind: "text",
		});
	});

	test("handleAuthorize renders passkey mode when a usable passkey exists", async () => {
		const harness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			kvGet: async (key) => (key === "ks:totp:secret" ? "totp-secret" : null),
		});
		const response = await harness.createHandlers().handleAuthorize();
		expect(response.status).toBe(200);
		expect(response.body).toContain("Authenticating with passkey");
		expect(response.body).toContain("Use passphrase + code instead");
		expect(response.body).toContain("auth-challenge");
		expect(response.body).toContain("fallback=1");
		expect(extractHiddenInputValue(response.body, "request_nonce")).toBe("token-1");
		expect(extractHiddenInputValue(response.body, "csrf_token")).toBe("token-2");
		expect(harness.kvWrites.map((entry) => entry.key)).toEqual(["ks:authreq:token-1"]);
		expect(harness.cookies.get("ks_csrf")).toBe("token-2");
	});
});
