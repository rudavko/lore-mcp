/** @implements FR-015, FR-002, FR-004, FR-005, FR-006 — Register time/build-info and entry/query MCP tools. */
import {
	buildValidationError,
	buildQueryText,
	filterByTags,
	handleBuildInfo,
	handleTime,
} from "./tools-core.pure.js";
import {
	normalizeMutationEntry,
	normalizeQueryEntry,
} from "./tools-entry-public.pure.js";
import {
	ensureEntryUpdatePatch,
	normalizeTtlSecondsArg,
	validateTtlSeconds,
} from "./tools-entry-write.pure.js";
import {
	ensureValidCursor,
} from "./tools-cursor.pure.js";
import {
	filterItemsByAsOf,
	parseOptionalAsOf,
	validateValidityInterval,
} from "./tools-validation.pure.js";
import {
	asRecord,
} from "./tools-public-record.pure.js";

export const _MODULE = "tools-register-entry.pure";
/** Register core and entry/query tools. */
export function registerEntryTools(server, schemas, deps) {
	const tool = (name, description, schema, handler) => {
		server.tool(name, description, schema, handler);
	};
	tool("time", "Returns the current time in a given timezone", schemas.time, (args) =>
		handleTime(args, {
			dateNow: deps.dateNow,
			timeNowForTimezone: deps.timeNowForTimezone,
			validateTimezone: deps.validateTimezone,
			formatError: deps.formatError,
			formatResult: deps.formatResult,
		}),
	);
	tool(
		"build_info",
		"Returns current package.json version and build hash",
		schemas.build_info,
		() =>
			handleBuildInfo({}, {
				appVersion: deps.appVersion,
				buildHash: deps.buildHash,
				formatResult: deps.formatResult,
			}),
	);
	tool(
		"enable_auto_updates",
		"Generate a short-lived browser link for installing GitHub auto-updates with a one-time PAT entry form",
		schemas.enable_auto_updates,
		(args, extra) =>
			deps.efctEnableAutoUpdates(args, {
				std: deps.std,
				resolveAutoUpdatesTargetRepo: deps.resolveAutoUpdatesTargetRepo,
				issueAutoUpdatesSetupToken: deps.issueAutoUpdatesSetupToken,
				autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
					buildEnableAutoUpdatesPath: deps.buildEnableAutoUpdatesPath,
					buildEnableAutoUpdatesUrl: deps.buildEnableAutoUpdatesUrl,
					resolveEnableAutoUpdatesBaseUrl: deps.resolveEnableAutoUpdatesBaseUrl,
					validation: {
						buildValidationError,
					},
					requestHeaders:
						typeof extra === "object" &&
						extra !== null &&
					typeof extra.requestInfo === "object" &&
					extra.requestInfo !== null &&
					typeof extra.requestInfo.headers === "object" &&
					extra.requestInfo.headers !== null
						? extra.requestInfo.headers
						: undefined,
				logEvent: deps.logEvent,
				formatResult: deps.formatResult,
				formatError: deps.formatError,
			}),
	);
	tool("store", "Create a knowledge entry", schemas.store, (args) =>
		deps.efctStore(args, {
				std: deps.std,
				checkPolicy: deps.checkPolicy,
				createAndEmbed: deps.createAndEmbed,
				entryPublic: {
					normalizeMutationEntry,
				},
				entryWrite: {
					normalizeTtlSecondsArg,
					validateTtlSeconds,
				},
				notifyResourceChange: deps.notifyResourceChange,
				logEvent: deps.logEvent,
				isInfiniteValidTo: deps.isInfiniteValidTo,
				normalizeValidToState: deps.normalizeValidToState,
				validation: {
					validateValidityInterval,
				},
				formatResult: deps.formatResult,
			}),
		);
	tool("update", "Update an existing knowledge entry", schemas.update, (args) =>
		deps.efctUpdate(args, {
				std: deps.std,
				checkPolicy: deps.checkPolicy,
				updateAndEmbed: deps.updateAndEmbed,
				entryPublic: {
					normalizeMutationEntry,
				},
				entryWrite: {
					ensureEntryUpdatePatch,
					normalizeTtlSecondsArg,
					validateTtlSeconds,
				},
				notifyResourceChange: deps.notifyResourceChange,
				logEvent: deps.logEvent,
				isInfiniteValidTo: deps.isInfiniteValidTo,
				normalizeValidToState: deps.normalizeValidToState,
				validation: {
					validateValidityInterval,
				},
				formatResult: deps.formatResult,
			}),
		);
	tool(
		"query",
		"Search knowledge entries with hybrid retrieval (lexical + semantic + graph)",
		schemas.query,
		(args) => {
			const queryText = buildQueryText(args);
			if (queryText.length > 0) {
					return deps.efctQueryHybrid(args, {
						cursor: {
							ensureValidCursor,
						},
						entryPublic: {
							normalizeQueryEntry,
						},
						std: deps.std,
						queryText,
						hybridSearch: deps.hybridSearch,
						filterByTags,
						logEvent: deps.logEvent,
						normalizeValidToState: deps.normalizeValidToState,
						validation: {
							filterItemsByAsOf,
							parseOptionalAsOf,
						},
						formatResult: deps.formatResult,
					});
				}
				return deps.efctQueryPlain(args, {
					cursor: {
						ensureValidCursor,
					},
					entryPublic: {
						normalizeQueryEntry,
					},
					recordPublic: {
						asRecord,
					},
					std: deps.std,
					queryEntries: deps.queryEntries,
					normalizeValidToState: deps.normalizeValidToState,
					validation: {
						filterItemsByAsOf,
						parseOptionalAsOf,
					},
					formatResult: deps.formatResult,
				});
			},
	);
	tool("delete", "Soft-delete an entry or triple", schemas.del, (args) =>
		deps.efctDelete(args, {
			checkPolicy: deps.checkPolicy,
			deleteByType: deps.deleteByType,
			notifyResourceChange: deps.notifyResourceChange,
			logEvent: deps.logEvent,
			formatResult: deps.formatResult,
		}),
	);
}
