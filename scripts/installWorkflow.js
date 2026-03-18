/**
 * Installs or updates the upstream-sync workflow in a GitHub repository.
 *
 * Resolution order for the target repo:
 * 1) argv[2] as explicit owner/repo
 * 2) TARGET_REPO env var (owner/repo)
 * 3) git remote.origin.url parsed as GitHub owner/repo
 *
 * Required env:
 *   GITHUB_TOKEN=...
 *
 * Usage:
 *   node scripts/installWorkflow.js
 *   node scripts/installWorkflow.js owner/repo
 *   TARGET_REPO=owner/repo node scripts/installWorkflow.js
 */

import { Buffer } from "node:buffer";

import { installWorkflowToRepo } from "../src/domain/github-workflow.ops.efct.js";
import {
	parseTargetRepo,
	renderWorkflowYaml,
} from "../src/domain/github-workflow.pure.js";
import { resolveTargetRepo } from "./targetRepo.js";

function readGitHubToken() {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		throw new Error("Missing GITHUB_TOKEN.");
	}
	return token;
}

function base64Encode(value) {
	return Buffer.from(value, "utf8").toString("base64");
}

async function githubFetch(path, githubToken, init) {
	const response = await fetch("https://api.github.com" + path, {
		method: init?.method || "GET",
		headers: {
			authorization: `Bearer ${githubToken}`,
			accept: "application/vnd.github+json",
			"user-agent": "lore-mcp",
			"x-github-api-version": "2022-11-28",
			...(init?.body ? { "content-type": "application/json" } : {}),
		},
		body: init?.body,
	});
	let body = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	return { status: response.status, ok: response.ok, body };
}

async function main() {
	const targetRepo = resolveTargetRepo({ explicitArg: process.argv[2] });
	const githubToken = readGitHubToken();
	const result = await installWorkflowToRepo(githubToken, targetRepo, {
		parseTargetRepo,
		renderWorkflowYaml,
		btoa: base64Encode,
		githubFetch,
		readJsonSafe: async (response) => response.body,
		jsonStringify: JSON.stringify,
	});
	if (!result.ok) {
		throw new Error(result.error || "Workflow install failed.");
	}
	console.log(
		JSON.stringify(
			{
				targetRepo,
				...result,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
