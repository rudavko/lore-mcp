/** @implements NFR-001 — Signed setup tokens for auto-updates links. */
/** Sentinel for TDD hook. */
export const _MODULE = "auto-updates-token.efct";

export function splitSetupToken(token) {
	if (typeof token !== "string") {
		return null;
	}
	const parts = token.split(".");
	if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
		return null;
	}
	return {
		payloadBase64Url: parts[0],
		signatureBase64Url: parts[1],
	};
}

export function decodeSetupPayload(payloadBase64Url, deps) {
	try {
		return {
			ok: true,
			payload: deps.jsonParse(deps.decodeTokenPayload(payloadBase64Url, deps)),
		};
	} catch {
		return {
			ok: false,
			payload: {
				repo: "__invalid__/__invalid__",
				exp: deps.nowMs() + 1,
			},
		};
	}
}

export function validateAutoUpdatesSetupPayload(payload, deps) {
	const repo = typeof payload?.repo === "string" ? payload.repo : null;
	const expiresAtMs = payload?.exp;
	if (repo === null || repo.length === 0) {
		return null;
	}
	if (!deps.numberIsFinite(expiresAtMs)) {
		return null;
	}
	if (expiresAtMs <= deps.nowMs()) {
		return null;
	}
	return {
		targetRepo: repo,
		expiresAtMs,
	};
}

export async function issueAutoUpdatesSetupToken(targetRepo, expiresAtMs, deps) {
	const payloadText = deps.jsonStringify({
		v: 1,
		repo: targetRepo,
		exp: expiresAtMs,
	});
	const payloadBase64Url = deps.encodeTokenPayload(payloadText, deps);
	const signatureBase64Url = await deps.signPayloadBase64Url(payloadBase64Url, deps);
	return payloadBase64Url + "." + signatureBase64Url;
}

export async function readAutoUpdatesSetupToken(token, deps) {
	const parsed = splitSetupToken(token);
	if (parsed === null) {
		return null;
	}
	const expectedSignatureBase64Url = await deps.signPayloadBase64Url(parsed.payloadBase64Url, deps);
	if (!(await deps.safeStringEqual(parsed.signatureBase64Url, expectedSignatureBase64Url, deps))) {
		return null;
	}
	const decoded = decodeSetupPayload(parsed.payloadBase64Url, deps);
	if (decoded.ok === false) {
		return null;
	}
	return validateAutoUpdatesSetupPayload(decoded.payload, deps);
}
