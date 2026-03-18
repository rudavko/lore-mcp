/** @implements NFR-001 — GitHub workflow effect operations with injected GitHub API boundaries. */
/** Sentinel for TDD hook. */
export const _MODULE = "github-workflow.efct";
const WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";
const COMMIT_MESSAGE = "chore: enable upstream sync";
function normalizeBase64Content(value) {
	let normalized = "";
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch !== "\n" && ch !== "\r" && ch !== "\t" && ch !== " ") {
			normalized += ch;
		}
	}
	return normalized;
}
// CONTEXT: formatGitHubError extracts a human-readable message from GitHub API
// error payloads. The payload shape varies, so we check for known fields.
function formatGitHubError(status, payload) {
	if (payload !== null && payload !== undefined && typeof payload === "object") {
		const p = payload;
		const message = typeof p.message === "string" ? p.message : undefined;
		const details = typeof p.documentation_url === "string" ? p.documentation_url : undefined;
		if (message && details) {
			return "GitHub API " + status + ": " + message + " (" + details + ")";
		}
		if (message) {
			return "GitHub API " + status + ": " + message;
		}
	}
	return "GitHub API " + status + ": unexpected response";
}
/** Install or update the upstream-sync workflow in a target GitHub repo. */
export async function installWorkflowToRepo(token, targetRepo, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const owner = parsed.owner;
	const repo = parsed.repo;
	/* Fetch repo metadata to get default branch. */
	const repoResponse = await deps.githubFetch("/repos/" + owner + "/" + repo, token);
	if (!repoResponse.ok) {
		const payload = await deps.readJsonSafe(repoResponse);
		return { ok: false, error: formatGitHubError(repoResponse.status, payload) };
	}
	const repoData = repoResponse.body;
	const defaultBranch = repoData.default_branch;
	if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
		return { ok: false, error: "Repository " + targetRepo + " returned no default_branch" };
	}
	/* Check if workflow file already exists. */
	const workflowYaml = deps.renderWorkflowYaml(targetRepo);
	const encodedWorkflowYaml = deps.btoa(workflowYaml);
	const contentPath =
		"/repos/" + owner + "/" + repo + "/contents/" + WORKFLOW_PATH + "?ref=" + defaultBranch;
	const contentResponse = await deps.githubFetch(contentPath, token);
	let existingSha;
	if (contentResponse.status === 200) {
		const contentData = contentResponse.body;
		if (typeof contentData.sha === "string") {
			existingSha = contentData.sha;
		}
		if (
			contentData.encoding === "base64" &&
			typeof contentData.content === "string" &&
			normalizeBase64Content(contentData.content) === encodedWorkflowYaml
		) {
			return {
				ok: true,
				action: "unchanged",
			};
		}
	} else if (contentResponse.status !== 404) {
		const payload = await deps.readJsonSafe(contentResponse);
		return { ok: false, error: formatGitHubError(contentResponse.status, payload) };
	}
	/* Create or update the workflow file. */
	const putPayload = {
		message: COMMIT_MESSAGE,
		content: encodedWorkflowYaml,
		branch: defaultBranch,
	};
	if (existingSha !== undefined) {
		putPayload.sha = existingSha;
	}
	const upsertPath = "/repos/" + owner + "/" + repo + "/contents/" + WORKFLOW_PATH;
	const upsertResponse = await deps.githubFetch(upsertPath, token, {
		method: "PUT",
		body: deps.jsonStringify(putPayload),
	});
	if (upsertResponse.status !== 200 && upsertResponse.status !== 201) {
		const errorPayload = await deps.readJsonSafe(upsertResponse);
		return { ok: false, error: formatGitHubError(upsertResponse.status, errorPayload) };
	}
	const resultData = upsertResponse.body;
	const commit = resultData.commit;
	return {
		ok: true,
		action: existingSha !== undefined ? "updated" : "created",
		commitSha: commit && typeof commit.sha === "string" ? commit.sha : undefined,
		commitUrl: commit && typeof commit.html_url === "string" ? commit.html_url : undefined,
	};
}
