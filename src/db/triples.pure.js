/** @implements FR-003, NFR-001 — Pure triple validation, normalization, and row mapping helpers. */
import { deriveValidToStateFromInput, normalizeValidToState } from "../lib/validity.pure.js";
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
function isIso8601(value) {
	return ISO_8601_RE.test(value);
}
export function validateTripleFields(params) {
	if (params.subject !== undefined && params.subject.length > 2000) {
		return { ok: false, error: validationErr("Subject exceeds 2000 characters") };
	}
	if (params.predicate !== undefined && params.predicate.length > 2000) {
		return { ok: false, error: validationErr("Predicate exceeds 2000 characters") };
	}
	if (params.object !== undefined && params.object.length > 2000) {
		return { ok: false, error: validationErr("Object exceeds 2000 characters") };
	}
	if (params.valid_from !== undefined && params.valid_from !== null) {
		if (!isIso8601(params.valid_from)) {
			return { ok: false, error: validationErr("valid_from must be ISO-8601") };
		}
	}
	const normalizedValidTo = deriveValidToStateFromInput(params.valid_to).validTo;
	if (normalizedValidTo !== undefined && normalizedValidTo !== null) {
		if (!isIso8601(normalizedValidTo)) {
			return { ok: false, error: validationErr("valid_to must be ISO-8601") };
		}
	}
	return { ok: true, value: undefined };
}
export function escapeTripleLike(value) {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
export function rowToTriple(r) {
	const validTo = r.valid_to ?? null;
	return {
		id: r.id,
		subject: r.subject,
		predicate: r.predicate,
		object: r.object,
		source: r.source ?? null,
		actor: r.actor ?? null,
		confidence: r.confidence ?? null,
		valid_from: r.valid_from ?? null,
		valid_to: validTo,
		valid_to_state: normalizeValidToState(r.valid_to_state, validTo),
		status: r.status ?? "active",
		created_at: r.created_at,
	};
}
export function buildTripleObject(id, params, now) {
	const normalizedValidity = deriveValidToStateFromInput(params.valid_to ?? null);
	return {
		id,
		subject: params.subject,
		predicate: params.predicate,
		object: params.object,
		source: params.source ?? null,
		actor: params.actor ?? null,
		confidence: params.confidence ?? null,
		valid_from: params.valid_from ?? null,
		valid_to: normalizedValidity.validTo ?? null,
		valid_to_state: params.valid_to_state ?? normalizedValidity.validToState,
		status: "active",
		created_at: now,
	};
}
export function buildTripleQueryConditions(params, decodedCursor) {
	const conditions = ["deleted_at IS NULL"];
	const binds = [];
	if (decodedCursor) {
		conditions.push("id < ?");
		binds.push(decodedCursor);
	}
	if (params.subject) {
		conditions.push("subject LIKE ? ESCAPE '\\'");
		binds.push("%" + escapeTripleLike(params.subject) + "%");
	}
	if (params.predicate) {
		conditions.push("predicate LIKE ? ESCAPE '\\'");
		binds.push("%" + escapeTripleLike(params.predicate) + "%");
	}
	if (params.object) {
		conditions.push("object LIKE ? ESCAPE '\\'");
		binds.push("%" + escapeTripleLike(params.object) + "%");
	}
	return { conditions, binds };
}
function validationErr(message) {
	return { code: "validation", message, retryable: false };
}
