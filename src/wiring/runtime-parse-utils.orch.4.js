/** @implements FR-001 — Runtime environment/config parsing helpers. */
function parseMultiPredicateConfig(raw, _std) {
	if (typeof raw !== "string" || raw.trim().length === 0) {
		return {};
	}
	const out = {};
	const parts = raw.split(",");
	for (let i = 0; i < parts.length; i++) {
		const value = parts[i].trim();
		if (value.length > 0) {
			out[value] = "multi";
		}
	}
	return out;
}

function parseSemanticMinScore(raw, std) {
	if (typeof raw !== "string") {
		return 0.25;
	}
	const parsed = std.Number(raw);
	if (!std.Number.isFinite(parsed)) {
		return 0.25;
	}
	if (parsed < 0) {
		return 0;
	}
	if (parsed > 1) {
		return 1;
	}
	return parsed;
}

function parsePositiveInteger(raw, fallback, std) {
	if (typeof raw !== "string") {
		return fallback;
	}
	const parsed = std.Number(raw);
	if (!std.Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export { parseMultiPredicateConfig, parsePositiveInteger, parseSemanticMinScore };
