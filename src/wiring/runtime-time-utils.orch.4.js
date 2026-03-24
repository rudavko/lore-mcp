/** @implements FR-001 — Runtime time, build, and timezone helpers. */
function nowIso(std) {
	return new std.Date().toISOString();
}

function validateTimezoneValue(timezone, std) {
	try {
		new std.Date().toLocaleString("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

function formatNowForTimezone(timezone, now, std) {
	const parsed = new std.Date(now);
	const baseDate = std.Number.isFinite(parsed.getTime()) ? parsed : new std.Date();
	const local = baseDate.toLocaleString("sv-SE", {
		timeZone: timezone,
		hour12: false,
	});
	return local.replace(" ", "T");
}

function computeExpiresAt(startIso, ttlMs, std) {
	const ms = std.Date.parse(startIso);
	const base = std.Number.isFinite(ms) ? ms : std.Date.now();
	return new std.Date(base + ttlMs).toISOString();
}

export {
	computeExpiresAt,
	formatNowForTimezone,
	nowIso,
	validateTimezoneValue,
};
