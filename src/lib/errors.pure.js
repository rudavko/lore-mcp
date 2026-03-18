/** @implements NFR-001 — Pure error-shaping helpers for consistent domain failures. */
function makeError(code, message, retryable) {
	return { code, message, retryable };
}
export function validationError(message) {
	return makeError("validation", message, false);
}
export function notFoundError(message) {
	return makeError("not_found", message, false);
}
export function conflictError(message) {
	return makeError("conflict", message, false);
}
export function policyError(message) {
	return makeError("policy", message, false);
}
export function dependencyError(message) {
	return makeError("dependency", message, true);
}
export function internalError(message) {
	return makeError("internal", message, false);
}
export function ok(value) {
	return { ok: true, value };
}
export function err(error) {
	return { ok: false, error };
}
export function isOk(r) {
	return r.ok === true;
}
export function isErr(r) {
	return r.ok === false;
}
