/** @implements NFR-001 — Pure helpers for one-time auto-updates setup links. */
/** Sentinel for TDD hook. */
export const _MODULE = "auto-updates-link.pure";
export const AUTO_UPDATES_LINK_PREFIX = "ks:auto_updates_link:";
export const AUTO_UPDATES_LINK_TTL_SECONDS = 15 * 60;

function normalizeAbsoluteBaseUrl(baseUrl) {
	if (typeof baseUrl !== "string") {
		return "";
	}
	const trimmed = baseUrl.trim();
	const normalizedBase = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
	if (!/^https?:\/\//u.test(normalizedBase)) {
		return "";
	}
	return normalizedBase;
}

function normalizeHeaderCandidate(value) {
	if (typeof value === "string") {
		return value.trim();
	}
	const values = Array.isArray(value) ? value : [];
	for (const candidate of values) {
		if (typeof candidate !== "string") {
			continue;
		}
		const trimmed = candidate.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return "";
}

function readHeaderValue(headers, name) {
	if (headers === null || Array.isArray(headers)) {
		return "";
	}
	const record = headers;
	const target = name.toLowerCase();
	const keys = Object.keys(record);
	for (let i = 0; i < keys.length; i++) {
		if (keys[i].toLowerCase() !== target) {
			continue;
		}
		const normalized = normalizeHeaderCandidate(record[keys[i]]);
		if (normalized.length > 0) {
			return normalized;
		}
	}
	return "";
}

function normalizeForwardedValue(raw) {
	if (typeof raw !== "string") {
		return "";
	}
	const first = raw.split(",")[0] || "";
	return first.trim();
}

function parseCfVisitorScheme(raw) {
	if (typeof raw !== "string") {
		return "";
	}
	const trimmed = raw.trim();
	const match = trimmed.match(/^\{"scheme"\s*:\s*"([^"]+)"\}$/u);
	if (!match) {
		return "";
	}
	const scheme = match[1].trim().toLowerCase();
	return scheme === "http" || scheme === "https" ? scheme : "";
}

function isLocalHost(host) {
	const normalized = host.trim().toLowerCase();
	return (
		normalized === "localhost" ||
		normalized.startsWith("localhost:") ||
		normalized === "127.0.0.1" ||
		normalized.startsWith("127.0.0.1:") ||
		normalized === "[::1]" ||
		normalized.startsWith("[::1]:")
	);
}

function hasSafeHostShape(host) {
	return host.length > 0 && !/[/?#@\s]/u.test(host);
}

function isKnownHttpScheme(value) {
	return value === "http" || value === "https";
}

function resolveScheme(forwardedProto, cfVisitorProto, hostHeader) {
	if (isKnownHttpScheme(forwardedProto)) {
		return forwardedProto;
	}
	if (isKnownHttpScheme(cfVisitorProto)) {
		return cfVisitorProto;
	}
	return isLocalHost(hostHeader) ? "http" : "https";
}

export function buildEnableAutoUpdatesPath(setupToken, encodeSetupToken) {
	return "/admin/install-workflow?setup_token=" + encodeSetupToken(setupToken);
}

export function buildEnableAutoUpdatesUrl(baseUrl, setupToken, encodeSetupToken) {
	const normalizedBase = normalizeAbsoluteBaseUrl(baseUrl);
	if (normalizedBase.length === 0) {
		return null;
	}
	return normalizedBase + buildEnableAutoUpdatesPath(setupToken, encodeSetupToken);
}

export function resolveEnableAutoUpdatesBaseUrl(requestHeaders) {
	const hostHeader = normalizeForwardedValue(
		readHeaderValue(requestHeaders, "x-forwarded-host") ||
			readHeaderValue(requestHeaders, "host"),
	);
	if (!hasSafeHostShape(hostHeader)) {
		return "";
	}
	const forwardedProto = normalizeForwardedValue(
		readHeaderValue(requestHeaders, "x-forwarded-proto"),
	).toLowerCase();
	const cfVisitorProto = parseCfVisitorScheme(readHeaderValue(requestHeaders, "cf-visitor"));
	const scheme = resolveScheme(forwardedProto, cfVisitorProto, hostHeader);
	return scheme + "://" + hostHeader;
}

export function getAutoUpdatesLinkInternals() {
	return {
		normalizeAbsoluteBaseUrl,
		normalizeHeaderCandidate,
		readHeaderValue,
		normalizeForwardedValue,
		parseCfVisitorScheme,
		isLocalHost,
		hasSafeHostShape,
		isKnownHttpScheme,
		resolveScheme,
	};
}
