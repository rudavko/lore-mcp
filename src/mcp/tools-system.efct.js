/** @implements FR-019, FR-020, NFR-001 — Effects-backed system/tooling handlers for auto-updates, history, and ingestion flows. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-system.efct";
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
/** Handle "undo" tool. */
export async function handleUndo(args, deps) {
	const reverted = await deps.undoTransactions(args.count || 1);
	if (reverted.length === 0) {
		return deps.formatResult(
			"Nothing to undo",
			{ reverted: [] },
			"knowledge://history/transactions",
		);
	}
	deps.notifyResourceChange("entry");
	deps.notifyResourceChange("triple");
	return deps.formatResult(
		"Reverted " + reverted.length + " transaction(s)",
		{ reverted },
		"knowledge://history/transactions",
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
/** Handle "ingestion_status" tool. */
export async function handleIngestionStatus(args, deps) {
	const status = await deps.getIngestionStatus(args.task_id);
	if (status === null) {
		return deps.formatError(deps.throwNotFound("Ingestion task", args.task_id));
	}
	return deps.formatResult(
		"Task " +
			args.task_id +
			": " +
			status.status +
			" (" +
			status.processed_items +
			"/" +
			status.total_items +
			")",
		status,
		"knowledge://ingestion/" + args.task_id,
	);
}
