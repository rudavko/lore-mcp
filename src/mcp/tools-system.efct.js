/** @implements FR-019, FR-020, NFR-001 — Effects-backed system/tooling handlers for auto-updates, history, and ingestion flows. */
/** Handle "auto_updates_status" engine_check action. */
export async function handleAutoUpdatesStatus(_args, deps) {
	const normalizedRepo = await deps.resolveAutoUpdatesTargetRepo();
	const configured = typeof normalizedRepo === "string" && normalizedRepo.length > 0;
	return deps.formatResult(
		configured
			? "Auto-updates are configured for a downstream target repo."
			: "Auto-updates are not configured on this server.",
		{
			action: "auto_updates_status",
			configured,
			target_repo: configured ? normalizedRepo : null,
			setup_mode: configured ? "one_time_browser_link" : null,
			installation_state: configured ? "unknown" : "not_configured",
			inspection_note:
				"Runtime can confirm the baked target repo, but it does not persist GitHub credentials or inspect downstream workflow installation state.",
		},
		"knowledge://history/transactions",
	);
}
/** Handle "enable_auto_updates" tool. */
export async function handleEnableAutoUpdates(_args, deps) {
	const normalizedRepo = await deps.resolveAutoUpdatesTargetRepo();
	if (!normalizedRepo) {
		throw deps.validation.buildValidationError(
			"Auto-updates target repo is not configured on the server. Expected TARGET_REPO to be baked in at deploy time.",
		);
	}
	const issuedAtMs = deps.std.Date.now();
	const expiresAtMs = issuedAtMs + deps.autoUpdatesLinkTtlSeconds * 1000;
	const setupToken = await deps.issueAutoUpdatesSetupToken(normalizedRepo, expiresAtMs);
	const resolvedBaseUrl = deps.resolveEnableAutoUpdatesBaseUrl(deps.requestHeaders);
	const path = deps.buildEnableAutoUpdatesPath(setupToken);
	const url = deps.buildEnableAutoUpdatesUrl(resolvedBaseUrl, setupToken);
	const browserDestination = url !== null ? url : path;
	const expiresAt = new deps.std.Date(expiresAtMs).toISOString();
	deps.logEvent("mutation", {
		op: "enable_auto_updates",
		ok: true,
		target_repo: normalizedRepo || null,
	});
	return deps.formatResult(
		(url !== null
			? "Open the one-time auto-updates link in your browser and enter the GitHub PAT."
			: "Open the one-time auto-updates path on this same server in your browser and enter the GitHub PAT.") +
			"\n" +
			"Target repo: " +
			normalizedRepo +
			"\n" +
			(url !== null ? "URL: " : "Path: ") +
			browserDestination,
		{
			url,
			path,
			expires_at: expiresAt,
			expires_in_seconds: deps.autoUpdatesLinkTtlSeconds,
			target_repo: normalizedRepo || null,
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
