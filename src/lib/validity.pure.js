/** @implements FR-003, NFR-001 — Pure validity interval normalization and classification helpers. */
export function isInfiniteValidTo(value) {
	const normalized = value.trim().toLowerCase();
	return normalized === "infinite" || normalized === "infinity" || normalized === "forever";
}
export function deriveValidToStateFromInput(value) {
	if (value === undefined) {
		return { validTo: undefined, validToState: "unspecified" };
	}
	if (value === null) {
		return { validTo: null, validToState: "unspecified" };
	}
	if (isInfiniteValidTo(value)) {
		return { validTo: null, validToState: "infinite" };
	}
	return { validTo: value, validToState: "bounded" };
}
export function normalizeValidToState(rawState, validTo) {
	if (rawState === "unspecified" || rawState === "infinite" || rawState === "bounded") {
		return rawState;
	}
	return validTo === null ? "unspecified" : "bounded";
}
