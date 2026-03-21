/** @implements FR-018, FR-011 — Verify authorize route handler behavior. */
import { describe, expect, test } from "bun:test";
import { csrfCookieNameForNonce } from "./auth-shared.pure.js";
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
			body: "Internal auth error.",
			kind: "text",
		});
	});

	test("handleAuthorize rejects malformed stored credential state with a controlled 400", async () => {
		const harness = createAuthRouteHarness({
			getCredential: async () => {
				const error = new Error("Stored passkey credential contains invalid JSON.");
				error.name = "AuthDependencyError";
				throw error;
			},
		});
		expect(await harness.createHandlers().handleAuthorize()).toEqual({
			status: 400,
			body: "Invalid authorization state. Retry authorization.",
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
		expect(response.body).toContain("Switch to the passphrase + authenticator form");
		expect(response.body).toContain("auth-challenge");
		expect(response.body).toContain("auth_mode=passphrase");
		expect(extractHiddenInputValue(response.body, "request_nonce")).toBe("token-1");
		expect(extractHiddenInputValue(response.body, "csrf_token")).toBe("token-2");
		expect(harness.kvWrites.map((entry) => entry.key)).toEqual(["ks:authreq:token-1"]);
		expect(JSON.parse(harness.kvWrites[0].value).flowState.requiredNextAction).toBe("approve_passkey");
		expect(harness.cookies.get(csrfCookieNameForNonce("token-1"))).toBe("token-2");
	});

	test("handleAuthorize renders passphrase UI on auth_mode=passphrase without changing stored auth policy", async () => {
		const harness = createAuthRouteHarness({
			getCredential: async () => ({ id: "cred-1", publicKey: "pubkey-1" }),
			kvGet: async (key) => (key === "ks:totp:secret" ? "totp-secret" : null),
		});
		harness.setQuery({ auth_mode: "passphrase" });
		const response = await harness.createHandlers().handleAuthorize();
		expect(response.status).toBe(200);
		expect(response.body).toContain('name="passphrase"');
		expect(response.body).toContain('name="totp_code"');
		expect(response.body).not.toContain("Authenticating with passkey");
		const stored = JSON.parse(harness.kvWrites[0].value).flowState;
		expect(stored.stage).toBe("awaiting_passkey");
		expect(stored.requiredNextAction).toBe("approve_passkey");
		expect(stored.allowedMethods).toEqual([
			"approve_passkey",
			"approve_passphrase_totp",
		]);
	});
});
