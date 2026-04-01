/** @implements FR-015, FR-002, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012, FR-013, FR-014, FR-019, FR-020, NFR-001 — Shared pure MCP tool helpers for time/build-info and query dispatch. */
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
export function buildValidationError(message) {
	return { code: "validation", message, retryable: false };
}
function isIso8601(value) {
	return ISO_8601_RE.test(value);
}
function isExplicitMulti(value) {
	return value === true;
}
/** Handle "time" tool. */
export function handleTime(args, deps) {
	const tz = args.timezone === undefined ? "UTC" : args.timezone;
		const validateTimezone = deps.validateTimezone || (() => true);
		if (!validateTimezone(tz)) {
			const err = buildValidationError("Invalid timezone");
			if (deps.formatError) {
				return deps.formatError(err);
			}
			return err;
	}
	const rawNow = deps.dateNow();
	const formatter = deps.timeNowForTimezone || ((_timezone, now) => now);
	const zonedNow = formatter(tz, rawNow);
	return deps.formatResult(zonedNow + " (" + tz + ")", { timezone: tz, now: zonedNow });
}
/** Handle "build_info" tool. */
export function handleBuildInfo(_args, deps) {
	return deps.formatResult("Build " + deps.appVersion + " (" + deps.buildHash + ")", {
		version: deps.appVersion,
		build_hash: deps.buildHash,
	});
}
/** Filter items by tags — all tags must match. */
export function filterByTags(items, tags) {
	if (!tags || tags.length === 0) {
		return items;
	}
	const filtered = [];
	for (let i = 0; i < items.length; i++) {
		let allMatch = true;
		for (let j = 0; j < tags.length; j++) {
			let found = false;
			for (let k = 0; k < items[i].tags.length; k++) {
				if (items[i].tags[k] === tags[j]) {
					found = true;
					break;
				}
			}
			if (!found) {
				allMatch = false;
				break;
			}
		}
		if (allMatch) {
			filtered.push(items[i]);
		}
	}
	return filtered;
}
/** Build query text from topic + content args. */
export function buildQueryText(args) {
	let queryText = "";
	if (args.topic) {
		queryText = queryText + args.topic;
	}
	if (args.content) {
		queryText = queryText + (queryText.length > 0 ? " " : "") + args.content;
	}
	return queryText;
}
/** Validate tool validity interval arguments. */
export function validateValidityIntervalArgs(args, isInfiniteValidTo) {
	const validFrom = args.valid_from;
	if (validFrom !== undefined && validFrom !== null) {
		if (typeof validFrom !== "string" || !isIso8601(validFrom)) {
			return buildValidationError("Invalid valid_from (must be ISO-8601)");
		}
	}
	const validTo = args.valid_to;
	if (validTo !== undefined && validTo !== null) {
		if (typeof validTo !== "string") {
			return buildValidationError("Invalid valid_to (must be ISO-8601)");
		}
		if (isInfiniteValidTo(validTo)) {
			return null;
		}
		if (!isIso8601(validTo)) {
			return buildValidationError("Invalid valid_to (must be ISO-8601)");
		}
	}
	return null;
}
/** Normalize the "multi" flag into explicit boolean intent. */
export function hasExplicitMulti(args) {
	return isExplicitMulti(args.multi);
}
