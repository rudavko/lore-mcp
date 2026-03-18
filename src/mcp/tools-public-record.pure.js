/** @implements FR-003, FR-004, FR-007, FR-008, FR-009, FR-010 — Shared public-record shaping helpers for MCP tool payloads. */
export function asRecord(value) {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value;
}

export function withOptionalValidToState(payload, validToState) {
	if (validToState === "unspecified") {
		return payload;
	}
	return { ...payload, valid_to_state: validToState };
}

export function stripValidityFields(value, normalizeValidToState) {
	const rec = asRecord(value);
	if (rec === null) {
		return value;
	}
	const {
		valid_from: _validFrom,
		valid_to: _validTo,
		valid_to_state: _rawValidToState,
		...rest
	} = rec;
	const validToState = normalizeValidToState(rec.valid_to_state, rec.valid_to ?? null);
	const withBounds = { ...rest };
	if (typeof rec.valid_from === "string") {
		withBounds.valid_from = rec.valid_from;
	}
	if (typeof rec.valid_to === "string") {
		withBounds.valid_to = rec.valid_to;
	}
	if (validToState === "unspecified") {
		return withBounds;
	}
	return { ...withBounds, valid_to_state: validToState };
}

export function stripValidityFieldsDeep(value, normalizeValidToState, std) {
	if (std.Array.isArray(value)) {
		const out = [];
		for (let i = 0; i < value.length; i++) {
			out.push(stripValidityFieldsDeep(value[i], normalizeValidToState, std));
		}
		return out;
	}
	const rec = asRecord(value);
	if (rec === null) {
		return value;
	}
	const stripped = stripValidityFields(rec, normalizeValidToState);
	const out = {};
	const keys = std.Object.keys(stripped);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		out[key] = stripValidityFieldsDeep(stripped[key], normalizeValidToState, std);
	}
	return out;
}
