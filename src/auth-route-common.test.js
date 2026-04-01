import { describe, expect, test } from "bun:test";
import { createPasskeyEnrollmentFlowState, buildStoredChallengeRecord } from "./auth-flow-state.pure.js";
import { csrfCookieNameForNonce } from "./auth-shared.pure.js";
import { consumePasskeyEnrollmentChallenge } from "./auth-route-common.orch.3.js";
import { createAuthRouteHarness } from "./auth-route-handlers.test-helpers.js";

function buildOauthReq() {
	return {
		responseType: "code",
		clientId: "test-client",
		redirectUri: "https://client.example/callback",
		scope: ["read"],
	};
}

describe("auth-route-common.orch", () => {
	test("consumePasskeyEnrollmentChallenge returns kind=ok on success", async () => {
		const harness = createAuthRouteHarness();
		harness.cookies.set(csrfCookieNameForNonce("nonce-1"), "csrf-1");
		harness.challengeMap.set(
			"nonce-1",
			buildStoredChallengeRecord(
				"reg-challenge",
				createPasskeyEnrollmentFlowState({
					oauthReq: buildOauthReq(),
					alternateFactorSatisfied: false,
					allowTotpEnrollment: true,
				}),
				"registration",
				"csrf-1",
			),
		);

		expect(
			await consumePasskeyEnrollmentChallenge(
				harness.deps,
				"nonce-1",
				"csrf-1",
				"csrf-1",
			),
		).toMatchObject({
			kind: "ok",
			challenge: {
				type: "registration",
				challenge: "reg-challenge",
			},
		});
	});
});
