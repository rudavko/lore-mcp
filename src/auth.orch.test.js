/** @implements FR-018 — Verify auth route registration paths remain stable. */
import { describe, expect, test } from "bun:test";
import { _MODULE, registerAuthRoutes } from "./auth.orch.1.js";

describe("auth.orch", () => {
	test("exports the expected sentinel", () => {
		expect(_MODULE).toBe("auth.orch");
	});

	test("registers every auth route on the expected HTTP method and path", () => {
		const routes = [];
		registerAuthRoutes(
			{
				get: (path) => {
					routes.push(`GET ${path}`);
				},
				post: (path) => {
					routes.push(`POST ${path}`);
				},
			},
			{
				kvGet: async () => null,
				kvPut: async () => undefined,
				kvDelete: async () => undefined,
				getCookie: () => "",
				setCookie: () => undefined,
				deleteCookie: () => undefined,
				randomToken: () => "token-1",
				safeStringEqual: async (left, right) => left === right,
				bodyString: (value) => (typeof value === "string" ? value : ""),
				getClientIp: () => "127.0.0.1",
				isIpLocked: async () => false,
				registerAuthFailure: async () => undefined,
				clearAuthFailures: async () => undefined,
				accessPassphrase: "test-pass",
				parseBody: async () => ({}),
				queryParam: () => "",
				getRequestUrl: () => "https://lore.example.com/authorize",
				parseUrl: (value) => new URL(value),
				htmlResponse: () => ({}),
				textResponse: () => ({}),
				redirectResponse: () => ({}),
				setCspNonce: () => undefined,
				parseAuthRequest: async () => ({
					responseType: "code",
					clientId: "client-id",
					redirectUri: "https://client.example/callback",
					scope: [],
				}),
				lookupClient: async () => ({ clientName: "Client" }),
				completeAuthorization: async () => "",
				getCredential: async () => null,
				storeCredential: async () => undefined,
				updateCredentialCounter: async () => undefined,
				createRegistrationOptions: async () => ({ challenge: "challenge" }),
				verifyRegistration: async () => null,
				createAuthenticationOptions: async () => ({}),
				verifyAuthentication: async () => ({ verified: false, newCounter: 0 }),
				storeChallenge: async () => undefined,
				consumeChallenge: async () => null,
				generateSecret: () => "SECRET",
				verifyTOTP: async () => false,
				buildOtpAuthUri: () => "",
				generateQrSvg: () => "<svg></svg>",
				formatSecretForDisplay: (secret) => secret,
				jsonStringify: JSON.stringify,
				jsonParse: JSON.parse,
				renderAuthPage: () => "",
				renderEnrollPasskeyPage: () => "",
				renderEnrollTotpPage: () => "",
				startPasskeyEnrollment: async () => ({}),
			},
		);

			expect(routes).toEqual([
				"GET /",
				"GET /authorize",
				"POST /approve",
				"POST /enroll-passkey",
				"POST /complete-passkey-skip",
				"POST /enroll-totp-redirect",
				"POST /enroll-totp",
			]);
		});
	});
