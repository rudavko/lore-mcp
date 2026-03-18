/** @implements FR-015, FR-002, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012, FR-013, FR-014, FR-019, FR-020, NFR-001 — MCP tool handler logic: pure registration/dispatch for query, graph, conflict, undo/history, entity, ingest, and summary flows. */
import { isInfiniteValidTo, normalizeValidToState } from "../lib/validity.pure.js";
import {
	buildQueryText as buildQueryTextCore,
	filterByTags as filterByTagsCore,
	handleBuildInfo as handleBuildInfoCore,
	handleTime as handleTimeCore,
} from "./tools-core.pure.js";
import { buildToolSchemas } from "./tools-schemas.pure.js";
import { registerEntryTools } from "./tools-register-entry.pure.js";
import { registerGraphTools } from "./tools-register-graph.pure.js";
import { registerEntityTools } from "./tools-register-entity.pure.js";
import { registerSystemTools } from "./tools-register-system.pure.js";

/** Sentinel for TDD hook. */
export const _MODULE = "tools.pure";
export function handleTime(args, deps) {
	return handleTimeCore(args, deps);
}
export function handleBuildInfo(args, deps) {
	return handleBuildInfoCore(args, deps);
}
export function filterByTags(items, tags) {
	return filterByTagsCore(items, tags);
}
export function buildQueryText(args) {
	return buildQueryTextCore(args);
}
// CONTEXT: All dependencies (z, DB functions, domain logic, format helpers, efct handlers) are injected
// via the deps parameter because non-index modules cannot have static value imports.
// The entry-point constructs the deps object from actual imports.
/** Register all MCP tools on the server. */
export function registerTools(server, deps) {
	let promiseResolve = deps.promiseResolve;
	if (typeof promiseResolve !== "function") {
		promiseResolve = (value) => ({
			then: (onFulfilled) => {
				if (typeof onFulfilled === "function") {
					return onFulfilled(value);
				}
				return value;
			},
		});
	}
	let isPredicateMulti = deps.isPredicateMulti;
	if (typeof isPredicateMulti !== "function") {
		isPredicateMulti = () => false;
	}
	const listRefutedHypotheses =
		typeof deps.listRefutedHypotheses === "function"
			? deps.listRefutedHypotheses
			: (_limit) => promiseResolve([]);
	const hasLessonForHypothesis =
		typeof deps.hasLessonForHypothesis === "function"
			? deps.hasLessonForHypothesis
			: (_id) => promiseResolve(false);
	const validatePromotionRelation =
		typeof deps.validatePromotionRelation === "function"
			? deps.validatePromotionRelation
			: () => promiseResolve(undefined);
	const deleteByType = (type, id) => {
		if (type === "entry") {
			return deps.deleteEntry(id).then(() => {
				if (deps.vectorizeDeleteByIds) {
					return deps.vectorizeDeleteByIds([id]);
				}
			});
		}
		return deps.deleteTriple(id);
	};
	const shared = {
		std: deps.std,
		formatResult: deps.formatResult,
		formatError: deps.formatError,
		checkPolicy: deps.checkPolicy,
		logEvent: deps.logEvent,
		notifyResourceChange: deps.notifyResourceChange,
		isInfiniteValidTo,
		normalizeValidToState,
		createEntry: deps.createEntry,
		updateEntry: deps.updateEntry,
		createAndEmbed:
			typeof deps.createAndEmbed === "function" ? deps.createAndEmbed : deps.createEntry,
		updateAndEmbed:
			typeof deps.updateAndEmbed === "function" ? deps.updateAndEmbed : deps.updateEntry,
		deleteEntry: deps.deleteEntry,
		queryEntries: deps.queryEntries,
		createTriple: deps.createTriple,
		updateTriple: deps.updateTriple,
		upsertTriple: deps.upsertTriple,
		deleteTriple: deps.deleteTriple,
		queryTriples: deps.queryTriples,
		queryEntities: deps.queryEntities,
		upsertEntity: deps.upsertEntity,
		mergeEntities: deps.mergeEntities,
		setEntryTypes: deps.setEntryTypes,
		listRefutedHypotheses,
		hasLessonForHypothesis,
		undoTransactions: deps.undoTransactions,
		getHistory: deps.getHistory,
		hybridSearch: deps.hybridSearch,
		shouldProcessAsync: deps.shouldProcessAsync,
		ingestSync: deps.ingestSync,
		ingestAsync: deps.ingestAsync,
		getIngestionStatus: deps.getIngestionStatus,
		saveConflict: deps.saveConflict,
		loadConflict: deps.loadConflict,
		removeConflict: deps.removeConflict,
		throwNotFound: deps.throwNotFound,
		dateNow: deps.dateNow,
		timeNowForTimezone: deps.timeNowForTimezone,
		validateTimezone: deps.validateTimezone,
		appVersion: typeof deps.appVersion === "string" ? deps.appVersion : "unknown",
		buildHash: typeof deps.buildHash === "string" ? deps.buildHash : "unknown",
		vectorizeDeleteByIds: deps.vectorizeDeleteByIds,
		isPredicateMulti,
		detectConflict: deps.detectConflict,
		validatePromotionRelation,
		resolveAutoUpdatesTargetRepo: deps.resolveAutoUpdatesTargetRepo,
		issueAutoUpdatesSetupToken: deps.issueAutoUpdatesSetupToken,
		autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
		buildEnableAutoUpdatesPath: deps.buildEnableAutoUpdatesPath,
		buildEnableAutoUpdatesUrl: deps.buildEnableAutoUpdatesUrl,
		resolveEnableAutoUpdatesBaseUrl: deps.resolveEnableAutoUpdatesBaseUrl,
		deleteByType,
		efctStore: deps.efctStore,
		efctUpdate: deps.efctUpdate,
		efctQueryHybrid: deps.efctQueryHybrid,
		efctQueryPlain: deps.efctQueryPlain,
		efctDelete: deps.efctDelete,
		efctRelateConflict: deps.efctRelateConflict,
		efctRelateCreate: deps.efctRelateCreate,
		efctQueryGraph: deps.efctQueryGraph,
		efctQueryEntities: deps.efctQueryEntities,
		efctUpdateTriple: deps.efctUpdateTriple,
		efctUpsertTriple: deps.efctUpsertTriple,
		efctResolveReject: deps.efctResolveReject,
		efctResolveReplace: deps.efctResolveReplace,
		efctResolveRetain: deps.efctResolveRetain,
		efctUpsertEntity: deps.efctUpsertEntity,
		efctSetType: deps.efctSetType,
		efctMergeEntities: deps.efctMergeEntities,
		efctExtractLessons: deps.efctExtractLessons,
		efctUndo: deps.efctUndo,
		efctHistory: deps.efctHistory,
		efctIngest: deps.efctIngest,
		efctIngestionStatus: deps.efctIngestionStatus,
		efctEnableAutoUpdates: deps.efctEnableAutoUpdates,
	};
	const schemas = buildToolSchemas(deps.z);
	registerEntryTools(server, schemas, shared);
	registerGraphTools(server, schemas, shared);
	registerEntityTools(server, schemas, shared);
	registerSystemTools(server, schemas, shared);
}
