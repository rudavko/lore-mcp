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

function resolveBuildHash(env) {
	const candidates = [env.BUILD_HASH, env.WORKERS_CI_COMMIT_SHA, env.CF_PAGES_COMMIT_SHA];
	for (let i = 0; i < candidates.length; i++) {
		if (typeof candidates[i] === "string" && candidates[i].length > 0) {
			return candidates[i];
		}
	}
	return "unknown";
}

export {
	computeExpiresAt,
	formatNowForTimezone,
	nowIso,
	resolveBuildHash,
	validateTimezoneValue,
};
