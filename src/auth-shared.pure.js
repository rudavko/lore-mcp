/** @implements FR-018, FR-011, NFR-006 — Pure shared auth constants. */
export const AUTH_REQUEST_TTL_SECONDS = 600;
export const CSRF_COOKIE_PREFIX = "ks_csrf";
export const AUTH_REQ_PREFIX = "ks:authreq:";
export const TOTP_SECRET_KEY = "ks:totp:secret";
export const TOTP_PENDING_PREFIX = "ks:totp:pending:";
export const TOTP_PENDING_TTL_SECONDS = 600;

export function csrfCookieNameForNonce(nonce) {
	return `${CSRF_COOKIE_PREFIX}_${nonce}`;
}
