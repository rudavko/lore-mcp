/** @implements FR-018, FR-011, NFR-006 — Pure shared auth constants and passphrase approval policy. */
export const _MODULE = "auth-shared.pure";
export const AUTH_REQUEST_TTL_SECONDS = 600;
export const CSRF_COOKIE_NAME = "ks_csrf";
export const AUTH_REQ_PREFIX = "ks:authreq:";
export const TOTP_SECRET_KEY = "ks:totp:secret";
export const TOTP_PENDING_PREFIX = "ks:totp:pending:";
export const TOTP_PENDING_TTL_SECONDS = 600;
export function decidePassphraseApprovalAction({
	hasTotpCode,
	totpEnrolled,
	passkeyUsable,
	allowPassphraseFallback,
}) {
	if (hasTotpCode && totpEnrolled) {
		return "verify_totp";
	}
	if (!totpEnrolled && !passkeyUsable) {
		return "start_passkey_enroll";
	}
	if (allowPassphraseFallback && passkeyUsable && !totpEnrolled) {
		return "complete";
	}
	return "deny";
}
