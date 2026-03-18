/** @implements NFR-001 — Pure auth helper functions: rate limiting, key builders, string utils. */
export const FAIL_WINDOW_TTL_SECONDS = 15 * 60;
export const LOCKOUT_TTL_SECONDS = 15 * 60;
export const MAX_FAILED_ATTEMPTS = 5;
function floorDivPositive(value, divisor) {
	return (value - (value % divisor)) / divisor;
}
/** Build KV key for auth failure counter. */
export function failKey(ip) {
	return `ks:authfail:${ip}`;
}
/** Build KV key for auth lockout flag. */
export function lockKey(ip) {
	return `ks:authlock:${ip}`;
}
/** Coerce a value to string, returning empty string for non-strings. */
export function bodyString(value) {
	if (typeof value === "string") {
		return value;
	}
	return "";
}
/** Extract client IP from header value, defaulting to "unknown". */
export function extractClientIp(headerValue) {
	if (headerValue === undefined || headerValue === "") {
		return "unknown";
	}
	return headerValue;
}
/** Parse existing fail count string and return the next count (incremented by 1). */
export function nextFailCount(raw) {
	if (raw === null || raw === "") {
		return 1;
	}
	let parsed = 0;
	let valid = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw.charCodeAt(i);
		if (ch >= 48 && ch <= 57) {
			parsed = parsed * 10 + (ch - 48);
			valid = true;
		} else {
			return 1;
		}
	}
	if (!valid) {
		return 1;
	}
	return parsed + 1;
}
/** Check if a fail count has reached the lockout threshold. */
export function isLockoutReached(count) {
	return count >= MAX_FAILED_ATTEMPTS;
}
/** Convert an array of byte values to a hex string. */
export function byteValuesToHexString(values) {
	let result = "";
	for (let i = 0; i < values.length; i++) {
		const hi = floorDivPositive(values[i], 16) % 16;
		const lo = values[i] % 16;
		result += "0123456789abcdef"[hi];
		result += "0123456789abcdef"[lo];
	}
	return result;
}
