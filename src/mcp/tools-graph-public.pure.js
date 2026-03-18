/** @implements FR-007, FR-008, FR-009, FR-010 — Shared public triple shaping helpers for MCP tool responses. */
import {
	asRecord,
	stripValidityFields,
	withOptionalValidToState,
} from "./tools-public-record.pure.js";

export function normalizeTriple(value, normalizeValidToState) {
	const rec = asRecord(value);
	if (rec === null) {
		return value;
	}
	const withoutValidity = stripValidityFields(rec, normalizeValidToState);
	const { valid_to_state: _rawState, ...publicTriple } = withoutValidity;
	return withOptionalValidToState(
		publicTriple,
		normalizeValidToState(rec.valid_to_state, rec.valid_to ?? null),
	);
}
