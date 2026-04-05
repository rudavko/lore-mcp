/** @implements FR-019, FR-020, NFR-001 — Effects-backed system/tooling handlers for auto-updates, history, and ingestion flows. */
/** Handle "auto_updates_status" engine_check action. */
export async function handleAutoUpdatesStatus(_args, deps) {
	const installState =
		typeof deps.readAutoUpdatesInstallState === "function"
			? await deps.readAutoUpdatesInstallState()
			: null;
	const installContext =
		typeof deps.resolveAutoUpdatesInstallContext === "function"
			? await deps.resolveAutoUpdatesInstallContext()
			: null;
	return deps.formatResult(
		installState !== null
			? "Auto-update install is recorded for a downstream deploy repo."
			: installContext !== null
				? "Auto-update install is available, but no workflow installation has been recorded yet."
				: "Auto-update install is unavailable because this deployment has no verified downstream repo context.",
		{
			action: "auto_updates_status",
			configured: installState !== null,
			target_repo: installState?.targetRepo ?? null,
			setup_mode: "one_time_browser_link",
			installation_state: installState !== null ? "recorded" : "not_installed",
			install_context_mode: installContext?.mode ?? null,
			expected_target_repo: installContext?.mode === "exact_repo" ? installContext.repo : null,
			expected_branch: installContext?.mode === "workers_build_ref" ? installContext.branch : null,
			expected_commit_sha:
				installContext?.mode === "workers_build_ref" ? installContext.commitSha : null,
			installed_at: installState?.installedAt ?? null,
			install_commit_sha: installState?.installCommitSha ?? null,
			install_commit_url: installState?.installCommitUrl ?? null,
			inspection_note:
				installState !== null
					? "Runtime records the last successful install target locally, but it does not keep a GitHub PAT and cannot continuously inspect downstream workflow drift."
					: "Runtime has no recorded successful workflow install yet.",
		},
		"knowledge://history/transactions",
	);
}
/** Handle "enable_auto_updates" tool. */
export async function handleEnableAutoUpdates(_args, deps) {
	const installContext =
		typeof deps.resolveAutoUpdatesInstallContext === "function"
			? await deps.resolveAutoUpdatesInstallContext()
			: null;
	if (installContext === null) {
		return deps.formatResult(
			"Auto-update setup is unavailable on this deployment because the worker does not have verified deploy-repo context. Redeploy from the Deploy to Cloudflare flow or use the direct maintainer install helper.",
			{
				url: null,
				path: null,
				expires_at: null,
				expires_in_seconds: deps.autoUpdatesLinkTtlSeconds,
				target_repo: null,
				install_context_mode: null,
				available: false,
			},
		);
	}
	const issuedAtMs = deps.std.Date.now();
	const expiresAtMs = issuedAtMs + deps.autoUpdatesLinkTtlSeconds * 1000;
	const setupToken = await deps.issueAutoUpdatesSetupToken(installContext, expiresAtMs);
	const resolvedBaseUrl = deps.resolveEnableAutoUpdatesBaseUrl(deps.requestHeaders);
	const path = deps.buildEnableAutoUpdatesPath(setupToken);
	const url = deps.buildEnableAutoUpdatesUrl(resolvedBaseUrl, setupToken);
	const browserDestination = url !== null ? url : path;
	const expiresAt = new deps.std.Date(expiresAtMs).toISOString();
	deps.logEvent("mutation", {
		op: "enable_auto_updates",
		ok: true,
		target_repo: installContext.mode === "exact_repo" ? installContext.repo : null,
	});
	const setupInstruction =
		installContext.mode === "exact_repo"
			? "Target repo: " +
				installContext.repo +
				". Use a fine-grained GitHub PAT scoped to that repo with metadata, contents, and workflow write access."
			: "Target repo verification: use a fine-grained GitHub PAT scoped to exactly one deploy repo. The install flow will verify that repo against this deployment's recorded branch and commit before writing the workflow.";
	return deps.formatResult(
		(url !== null
			? "Open the one-time auto-updates link in your browser and enter the GitHub PAT."
			: "Open the one-time auto-updates path on this same server in your browser and enter the GitHub PAT.") +
			"\n" +
			setupInstruction +
			"\n" +
			(url !== null ? "URL: " : "Path: ") +
			browserDestination,
		{
			url,
			path,
			expires_at: expiresAt,
			expires_in_seconds: deps.autoUpdatesLinkTtlSeconds,
			target_repo: installContext.mode === "exact_repo" ? installContext.repo : null,
			install_context_mode: installContext.mode,
			expected_branch: installContext.mode === "workers_build_ref" ? installContext.branch : null,
			expected_commit_sha:
				installContext.mode === "workers_build_ref" ? installContext.commitSha : null,
			available: true,
		},
	);
}
/** Handle "history" tool. */
export async function handleHistory(args, deps) {
	const cursorError = deps.cursor.ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	const result = await deps.getHistory(args);
	return deps.formatResult(
		result.items.length > 0 ? result.items.length + " transactions" : "No transactions found",
		{ items: result.items, next_cursor: result.next_cursor },
		"knowledge://history/transactions",
	);
}
/** Handle "ingest" tool. */
export async function handleIngest(args, deps) {
	if (deps.shouldProcessAsync(args.content)) {
		const result = await deps.ingestAsync(args.content, args.source);
		return deps.formatResult(
			"Async ingestion started: " + result.task_id,
			result,
			"knowledge://ingestion/" + result.task_id,
		);
	}
	const result = await deps.ingestSync(args.content, args.source);
	deps.notifyResourceChange("entry");
	return deps.formatResult(
		"Ingested " +
			result.entries_created +
			" entries (" +
			result.duplicates_skipped +
			" duplicates skipped)",
		result,
		"knowledge://ingestion/" + result.task_id,
	);
}
