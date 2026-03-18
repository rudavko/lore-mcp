import { execFileSync } from "node:child_process";

import { normalizeRepoFullName } from "../src/domain/github-workflow.pure.js";

export function getGitOriginUrl(cwd = process.cwd()) {
	try {
		return execFileSync("git", ["config", "--get", "remote.origin.url"], {
			cwd,
			encoding: "utf8",
		}).trim();
	} catch {
		throw new Error("git remote.origin.url is unavailable.");
	}
}

export function parseGitHubRepoFromOrigin(originUrl) {
	const patterns = [
		/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
		/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
		/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
	];
	for (let i = 0; i < patterns.length; i++) {
		const match = originUrl.match(patterns[i]);
		if (match) {
			return normalizeRepoFullName(`${match[1]}/${match[2]}`);
		}
	}
	throw new Error(
		`Could not parse GitHub owner/repo from remote.origin.url="${originUrl}".`,
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
	return parseGitHubRepoFromOrigin(getGitOriginUrl(options.cwd));
}
