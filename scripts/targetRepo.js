import { normalizeRepoFullName } from "../src/domain/github-workflow.pure.js";

function missingTargetRepoError() {
	return new Error(
		"Missing TARGET_REPO. Provide the downstream deploy repo explicitly via argv or TARGET_REPO env. Never infer it from the source repo Git remote.",
	);
}

export function resolveTargetRepo(options = {}) {
	const explicit = options.explicitArg;
	if (typeof explicit === "string" && explicit.length > 0) {
		return normalizeRepoFullName(explicit);
	}
	const envValue =
		typeof options.envTargetRepo === "string" && options.envTargetRepo.length > 0
			? options.envTargetRepo
			: process.env.TARGET_REPO;
	if (envValue) {
		return normalizeRepoFullName(envValue);
	}
	throw missingTargetRepoError();
}
