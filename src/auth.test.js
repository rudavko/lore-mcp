/** @implements FR-018 — Verify passphrase approval branch selection remains stable under refactors. */
import { describe, expect, test } from "bun:test";
import { decidePassphraseApprovalAction } from "./auth-shared.pure.js";

describe("auth.efct decidePassphraseApprovalAction", () => {
	test("selects TOTP verification when a code is provided and TOTP is enrolled", () => {
		expect(
			decidePassphraseApprovalAction({
				hasTotpCode: true,
				totpEnrolled: true,
				passkeyUsable: false,
				allowPassphraseFallback: false,
			}),
		).toBe("verify_totp");
	});

	test("starts passkey enrollment when no second factor is enrolled", () => {
		expect(
			decidePassphraseApprovalAction({
				hasTotpCode: false,
				totpEnrolled: false,
				passkeyUsable: false,
				allowPassphraseFallback: false,
			}),
		).toBe("start_passkey_enroll");
	});

	test("completes on explicit fallback when passkey is usable and TOTP is absent", () => {
		expect(
			decidePassphraseApprovalAction({
				hasTotpCode: false,
				totpEnrolled: false,
				passkeyUsable: true,
				allowPassphraseFallback: true,
			}),
		).toBe("complete");
	});

	test("denies when a second factor is enrolled but not satisfied", () => {
		expect(
			decidePassphraseApprovalAction({
				hasTotpCode: false,
				totpEnrolled: true,
				passkeyUsable: true,
				allowPassphraseFallback: false,
			}),
		).toBe("deny");
	});
});
