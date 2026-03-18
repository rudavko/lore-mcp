/** @implements FR-003, FR-004, FR-007, FR-008, FR-009 — Shared pure MCP validation and temporal filtering helpers. */
import { buildValidationError } from "./tools-core.pure.js";

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateIso8601String(value, std) {
	if (!ISO_8601_RE.test(value)) {
		return false;
	}
	return std.Number.isFinite(std.Date.parse(value));
}

export function parseIsoMillis(value, std) {
	if (typeof value !== "string" || !validateIso8601String(value, std)) {
		return null;
	}
	const parsed = std.Date.parse(value);
	if (!std.Number.isFinite(parsed)) {
		return null;
	}
	return parsed;
}

export function validateValidityInterval(args, isInfiniteValidTo, std) {
	const validFrom = args.valid_from;
	let validFromIso = null;
	if (validFrom !== undefined && validFrom !== null) {
		if (typeof validFrom !== "string" || !validateIso8601String(validFrom, std)) {
			return buildValidationError("Invalid valid_from (must be ISO-8601)");
		}
		validFromIso = validFrom;
	}
	const validTo = args.valid_to;
	let validToIso = null;
	if (validTo !== undefined && validTo !== null) {
		if (typeof validTo !== "string") {
			return buildValidationError("Invalid valid_to (must be ISO-8601)");
		}
		if (isInfiniteValidTo(validTo)) {
			return null;
		}
		if (!validateIso8601String(validTo, std)) {
			return buildValidationError("Invalid valid_to (must be ISO-8601)");
		}
		validToIso = validTo;
	}
	if (validFromIso !== null && validToIso !== null) {
		const validFromMs = parseIsoMillis(validFromIso, std);
		const validToMs = parseIsoMillis(validToIso, std);
		if (validFromMs !== null && validToMs !== null && validToMs < validFromMs) {
			return buildValidationError("Invalid validity interval (valid_to must be >= valid_from)");
		}
	}
	return null;
}

export function parseOptionalAsOf(raw, std) {
	if (raw === undefined || raw === null) {
		return { asOfMs: null, error: null };
	}
	const parsed = parseIsoMillis(raw, std);
	if (parsed === null) {
		return {
			asOfMs: null,
			error: buildValidationError("Invalid as_of (must be ISO-8601)"),
		};
	}
	return { asOfMs: parsed, error: null };
}

export function isValidAtAsOf(item, asOfMs, std) {
	if (asOfMs === null) {
		return true;
	}
	const validFromMs = parseIsoMillis(item.valid_from, std);
	if (validFromMs !== null && validFromMs > asOfMs) {
		return false;
	}
	const validToMs = parseIsoMillis(item.valid_to, std);
	if (validToMs !== null && validToMs < asOfMs) {
		return false;
	}
	return true;
}

export function filterItemsByAsOf(items, asOfMs, std) {
	if (asOfMs === null) {
		return items;
	}
	const filtered = [];
	for (let i = 0; i < items.length; i++) {
		if (isValidAtAsOf(items[i], asOfMs, std)) {
			filtered.push(items[i]);
		}
	}
	return filtered;
}
