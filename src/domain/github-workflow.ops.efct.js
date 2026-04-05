/** @implements NFR-001 — GitHub workflow effect operations with injected GitHub API boundaries. */
const WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";
const COMMIT_MESSAGE = "chore: bump lore-mcp dependency";
const MANAGED_WORKFLOW_HEADER = "# Managed by lore-mcp auto-updates";
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

function canWriteWorkflow(repoData) {
	if (repoData === null || repoData === undefined || typeof repoData !== "object") {
		return false;
	}
	const permissions =
		repoData.permissions !== null &&
		repoData.permissions !== undefined &&
		typeof repoData.permissions === "object"
			? repoData.permissions
			: null;
	return Boolean(
		permissions &&
			((typeof permissions.admin === "boolean" && permissions.admin) ||
				(typeof permissions.push === "boolean" && permissions.push) ||
				(typeof permissions.maintain === "boolean" && permissions.maintain)),
	);
}

function normalizeRepoCandidate(repoData) {
	if (repoData === null || repoData === undefined || typeof repoData !== "object") {
		return null;
	}
	if (!canWriteWorkflow(repoData)) {
		return null;
	}
	const fullName = typeof repoData.full_name === "string" ? repoData.full_name.trim() : "";
	return fullName.length > 0 ? fullName : null;
}

function encodePathComponent(value, deps) {
	const encoder =
		typeof deps.encodeUriComponent === "function" ? deps.encodeUriComponent : encodeURIComponent;
	return encoder(value);
}

function decodeBase64Utf8(base64Text, deps) {
	if (typeof base64Text !== "string" || base64Text.length === 0) {
		return "";
	}
	const atobImpl = typeof deps.atob === "function" ? deps.atob : atob;
	try {
		return atobImpl(normalizeBase64Content(base64Text));
	} catch {
		return "";
	}
}

async function listWritablePatRepos(token, deps) {
	const response = await deps.githubFetch("/user/repos?per_page=100&sort=updated", token);
	if (!response.ok) {
		const payload = await deps.getBody(response);
		return { ok: false, error: formatGitHubError(response.status, payload) };
	}
	const repos = Array.isArray(response.body) ? response.body : null;
	if (repos === null) {
		return { ok: false, error: "GitHub API returned an unexpected repository list payload" };
	}
	const writableRepos = [];
	for (let i = 0; i < repos.length; i++) {
		const targetRepo = normalizeRepoCandidate(repos[i]);
		if (targetRepo !== null) {
			writableRepos.push(targetRepo);
		}
	}
	return { ok: true, writableRepos };
}

async function fetchRepoMetadata(token, targetRepo, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const repoResponse = await deps.githubFetch("/repos/" + parsed.owner + "/" + parsed.repo, token);
	if (!repoResponse.ok) {
		const payload = await deps.getBody(repoResponse);
		return { ok: false, error: formatGitHubError(repoResponse.status, payload) };
	}
	const repoData = repoResponse.body;
	const defaultBranch = repoData.default_branch;
	if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
		return { ok: false, error: "Repository " + targetRepo + " returned no default_branch" };
	}
	return {
		ok: true,
		owner: parsed.owner,
		repo: parsed.repo,
		defaultBranch,
		repoData,
	};
}

async function verifyRepoMatchesWorkersBuildRef(token, targetRepo, installContext, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const branchPath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/branches/" +
		encodePathComponent(installContext.branch, deps);
	const branchResponse = await deps.githubFetch(branchPath, token);
	if (!branchResponse.ok) {
		const payload = await deps.getBody(branchResponse);
		return { ok: false, error: formatGitHubError(branchResponse.status, payload) };
	}
	const comparePath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/compare/" +
		encodePathComponent(installContext.commitSha + "..." + installContext.branch, deps);
	const compareResponse = await deps.githubFetch(comparePath, token);
	if (!compareResponse.ok) {
		const payload = await deps.getBody(compareResponse);
		return { ok: false, error: formatGitHubError(compareResponse.status, payload) };
	}
	const status = typeof compareResponse.body?.status === "string" ? compareResponse.body.status : "";
	if (status !== "ahead" && status !== "identical") {
		return {
			ok: false,
			error:
				"GitHub PAT repo does not match the repo that produced this deployment. Use a fine-grained PAT scoped to the Deploy to Cloudflare repo that is connected to this worker.",
		};
	}
	return { ok: true };
}

async function validateDeployRepoShape(token, targetRepo, defaultBranch, deps) {
	const parsed = deps.parseTargetRepo(targetRepo);
	if (parsed.error || !parsed.owner || !parsed.repo) {
		return { ok: false, error: parsed.error || "Invalid repo format" };
	}
	const packagePath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/contents/package.json?ref=" +
		encodePathComponent(defaultBranch, deps);
	const packageResponse = await deps.githubFetch(packagePath, token);
	if (!packageResponse.ok) {
		const payload = await deps.getBody(packageResponse);
		return {
			ok: false,
			error:
				"Deploy repo validation failed while reading package.json: " +
				formatGitHubError(packageResponse.status, payload),
		};
	}
	const packageJsonText = decodeBase64Utf8(packageResponse.body?.content, deps);
	let packageJson;
	try {
		packageJson = JSON.parse(packageJsonText);
	} catch {
		return { ok: false, error: "Deploy repo validation failed: package.json is not valid JSON." };
	}
	const loreDependency = packageJson?.dependencies?.["lore-mcp"];
	if (typeof loreDependency !== "string" || loreDependency.length === 0) {
		return {
			ok: false,
			error:
				"Deploy repo validation failed: package.json dependencies.lore-mcp is missing.",
		};
	}
	const wranglerPath =
		"/repos/" +
		parsed.owner +
		"/" +
		parsed.repo +
		"/contents/wrangler.jsonc?ref=" +
		encodePathComponent(defaultBranch, deps);
	const wranglerResponse = await deps.githubFetch(wranglerPath, token);
	if (!wranglerResponse.ok) {
		const payload = await deps.getBody(wranglerResponse);
		return {
			ok: false,
			error:
				"Deploy repo validation failed while reading wrangler.jsonc: " +
				formatGitHubError(wranglerResponse.status, payload),
		};
	}
	return { ok: true };
}

/** Discover and verify the downstream deploy repo from the install context and PAT. */
export async function discoverDeployRepo(token, installContext, deps) {
	if (installContext === null || installContext === undefined || typeof installContext !== "object") {
		return { ok: false, error: "Install link is missing deploy-repo verification context." };
	}
	if (installContext.mode === "exact_repo") {
		const repoMeta = await fetchRepoMetadata(token, installContext.repo, deps);
		if (!repoMeta.ok) {
			return repoMeta;
		}
		const shapeCheck = await validateDeployRepoShape(
			token,
			installContext.repo,
			repoMeta.defaultBranch,
			deps,
		);
		if (!shapeCheck.ok) {
			return shapeCheck;
		}
		return { ok: true, targetRepo: installContext.repo };
	}
	if (installContext.mode !== "workers_build_ref") {
		return { ok: false, error: "Install link has an unsupported deploy-repo verification mode." };
	}
	const listed = await listWritablePatRepos(token, deps);
	if (!listed.ok) {
		return listed;
	}
	if (listed.writableRepos.length === 0) {
		return {
			ok: false,
			error:
				"Automatic repository verification found no writable GitHub repositories for this PAT. Use a fine-grained PAT scoped to exactly one deploy repo with metadata, contents, and workflow write access.",
		};
	}
	if (listed.writableRepos.length !== 1) {
		return {
			ok: false,
			error:
				"Automatic repository verification requires a fine-grained PAT scoped to exactly one writable deploy repo. Narrow the PAT and retry.",
		};
	}
	const targetRepo = listed.writableRepos[0];
	const repoMeta = await fetchRepoMetadata(token, targetRepo, deps);
	if (!repoMeta.ok) {
		return repoMeta;
	}
	const refCheck = await verifyRepoMatchesWorkersBuildRef(token, targetRepo, installContext, deps);
	if (!refCheck.ok) {
		return refCheck;
	}
	const shapeCheck = await validateDeployRepoShape(token, targetRepo, repoMeta.defaultBranch, deps);
	if (!shapeCheck.ok) {
		return shapeCheck;
	}
	return { ok: true, targetRepo };
}

/** Install or update the upstream-sync workflow in a target GitHub repo. */
export async function installWorkflowToRepo(token, targetRepo, deps) {
	const repoMeta = await fetchRepoMetadata(token, targetRepo, deps);
	if (!repoMeta.ok) {
		return repoMeta;
	}
	const owner = repoMeta.owner;
	const repo = repoMeta.repo;
	const defaultBranch = repoMeta.defaultBranch;
	const shapeCheck = await validateDeployRepoShape(token, targetRepo, defaultBranch, deps);
	if (!shapeCheck.ok) {
		return shapeCheck;
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
		const existingWorkflowText = decodeBase64Utf8(contentData.content, deps);
		if (!existingWorkflowText.startsWith(MANAGED_WORKFLOW_HEADER)) {
			return {
				ok: false,
				error:
					"Refusing to overwrite an existing unmanaged workflow at " +
					WORKFLOW_PATH +
					". Remove it manually or replace it with the managed lore-mcp workflow first.",
			};
		}
	} else if (contentResponse.status !== 404) {
		const payload = await deps.getBody(contentResponse);
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
		const errorPayload = await deps.getBody(upsertResponse);
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
