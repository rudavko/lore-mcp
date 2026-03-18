/** @implements FR-003, FR-008, FR-012, FR-019 — Shared pure MCP cursor validation helpers. */
import { buildValidationError } from "./tools-core.pure.js";

export function isValidCursor(raw, std) {
	if (raw === undefined || raw === null) {
		return true;
	}
	if (typeof raw !== "string" || raw.length === 0) {
		return false;
	}
	try {
		const decoded = std.atob(raw);
		if (decoded.length === 0) {
			return false;
		}
		const normalizedInput = raw.replace(/=+$/u, "");
		const normalizedRoundTrip = std.btoa(decoded).replace(/=+$/u, "");
		return normalizedInput === normalizedRoundTrip;
	} catch {
		return false;
	}
}

export function ensureValidCursor(raw, std) {
	if (isValidCursor(raw, std)) {
		return null;
	}
	return buildValidationError("Invalid cursor");
}
