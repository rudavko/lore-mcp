/** @implements FR-001 — Host adapter builder for tool-layer env/binding concerns. */
import { parsePositiveInteger } from "./runtime-value-helpers.orch.3.js";
import { safeStringEqual } from "../lib/constant-time-equal.pure.js";

function resolveBuildHash(env) {
	const candidates = [env.BUILD_HASH, env.WORKERS_CI_COMMIT_SHA, env.CF_PAGES_COMMIT_SHA];
	for (let i = 0; i < candidates.length; i++) {
		if (typeof candidates[i] === "string" && candidates[i].length > 0) {
			return candidates[i];
		}
	}
	return "unknown";
}

function createToolsHostDeps(env, deps) {
	const accessPassphrase =
		typeof env.ACCESS_PASSPHRASE === "string" ? env.ACCESS_PASSPHRASE : "";
	return {
		db: env.DB,
		buildHash: resolveBuildHash(env),
		embeddingMaxRetries: parsePositiveInteger(env.EMBEDDING_MAX_RETRIES, 5, deps.std),
		resolveAutoUpdatesTargetRepo: async () => {
			const envTargetRepo = typeof env.TARGET_REPO === "string" ? env.TARGET_REPO : "";
			return deps.normalizeRepoFullName(envTargetRepo) || "";
		},
		vectorizeDeleteByIds: env.VECTORIZE_INDEX ? (ids) => env.VECTORIZE_INDEX.deleteByIds(ids) : undefined,
		issueAutoUpdatesSetupToken: (targetRepo, expiresAtMs) =>
			deps.issueAutoUpdatesSetupToken(targetRepo, expiresAtMs, {
				accessPassphrase,
				cryptoLike: deps.cryptoLike,
				textEncoderCtor: deps.textEncoderCtor,
				textDecoderCtor: deps.textDecoderCtor,
				uint8ArrayCtor: deps.uint8ArrayCtor,
				arrayFrom: deps.std.Array.from,
				stringFromCharCode: deps.std.String.fromCharCode,
				numberIsFinite: deps.std.Number.isFinite,
				btoa: deps.std.btoa,
				atob: deps.std.atob,
				jsonStringify: deps.jsonStringify,
				jsonParse: deps.jsonParse,
				nowMs: deps.std.Date.now,
				safeStringEqual,
			}),
	};
}

export { createToolsHostDeps, resolveBuildHash };
