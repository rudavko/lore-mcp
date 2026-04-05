/** @implements NFR-001 — Signed setup tokens for auto-updates links. */

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
	const rawContext =
		payload !== null && payload !== undefined && typeof payload === "object" ? payload.ctx : null;
	if (repo === null) {
		return null;
	}
	if (!deps.numberIsFinite(expiresAtMs)) {
		return null;
	}
	if (expiresAtMs <= deps.nowMs()) {
		return null;
	}
	let installContext = null;
	if (rawContext !== null && rawContext !== undefined) {
		if (typeof rawContext !== "object") {
			return null;
		}
		if (rawContext.mode === "exact_repo") {
			if (typeof rawContext.repo !== "string" || rawContext.repo.length === 0) {
				return null;
			}
			installContext = {
				mode: "exact_repo",
				repo: rawContext.repo,
			};
		} else if (rawContext.mode === "workers_build_ref") {
			if (
				typeof rawContext.branch !== "string" ||
				rawContext.branch.length === 0 ||
				typeof rawContext.commitSha !== "string" ||
				rawContext.commitSha.length === 0
			) {
				return null;
			}
			installContext = {
				mode: "workers_build_ref",
				branch: rawContext.branch,
				commitSha: rawContext.commitSha,
			};
		} else {
			return null;
		}
	} else if (repo.length > 0) {
		installContext = {
			mode: "exact_repo",
			repo,
		};
	} else {
		return null;
	}
	return {
		targetRepo: repo,
		expiresAtMs,
		installContext,
	};
}

export async function issueAutoUpdatesSetupToken(targetRepoOrContext, expiresAtMs, deps) {
	const installContext =
		targetRepoOrContext !== null &&
		targetRepoOrContext !== undefined &&
		typeof targetRepoOrContext === "object"
			? targetRepoOrContext
			: null;
	const targetRepo =
		installContext && installContext.mode === "exact_repo"
			? installContext.repo
			: typeof targetRepoOrContext === "string"
				? targetRepoOrContext
				: "";
	const payload = {
		v: 2,
		repo: targetRepo,
		exp: expiresAtMs,
	};
	if (installContext !== null) {
		payload.ctx = installContext;
	}
	const payloadText = deps.jsonStringify(payload);
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
