/** @implements FR-001 — MCP tool dependency assembly from configured runtime operations. */
import {
	formatNowForTimezone,
	nowIso,
	throwNotFoundValue,
	validateTimezoneValue,
} from "./runtime-value-helpers.orch.3.js";
import { encodeUriComponentValue } from "./runtime-surface.orch.3.js";
import { createEmbeddingToolHelpers } from "./runtime-tools-embedding.orch.4.js";
import { createMaintenanceToolHelpers } from "./runtime-tools-maintenance.orch.4.js";

function buildToolsDeps(core, runtimeOps, deps, host) {
	const randomToken = () => {
		const bytes = new deps.uint8ArrayCtor(16);
		deps.cryptoLike.getRandomValues(bytes);
		return deps.byteValuesToHexString(deps.std.Array.from(bytes));
	};
	const embedding = createEmbeddingToolHelpers({
		createEntry: runtimeOps.entryAndTriple.createEntry,
		db: host.db,
		embeddingMaxRetries: host.embeddingMaxRetries,
		logEvent: core.logEvent,
		std: deps.std,
		syncEmbedding: runtimeOps.search.syncEmbedding,
		updateEntry: runtimeOps.entryAndTriple.updateEntry,
	});
	const maintenance = createMaintenanceToolHelpers({
		db: host.db,
		deleteEntry: runtimeOps.entryAndTriple.deleteEntry,
		isCompatiblePromotionEdge: deps.isCompatiblePromotionEdge,
		isKnowledgeType: deps.isKnowledgeType,
		isMemoryType: deps.isMemoryType,
		isPromotionPredicate: deps.isPromotionPredicate,
		setEntryTypes: runtimeOps.entryAndTriple.setEntryTypes,
		std: deps.std,
	});
	return {
		z: deps.z,
		std: deps.std,
		appVersion:
			typeof deps.appVersion === "function" ? deps.appVersion(host.env) : deps.appVersion,
		autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
		buildEnableAutoUpdatesPath: (setupToken) =>
			deps.buildEnableAutoUpdatesPath(setupToken, (value) =>
				encodeUriComponentValue(value, deps.std),
			),
		buildEnableAutoUpdatesUrl: (baseUrl, setupToken) =>
			deps.buildEnableAutoUpdatesUrl(baseUrl, setupToken, (value) =>
				encodeUriComponentValue(value, deps.std),
			),
		buildHash: host.buildHash,
		checkPolicy: core.checkPolicy,
		createAndEmbed: embedding.createAndEmbed,
		createEntry: runtimeOps.entryAndTriple.createEntry,
		createTriple: runtimeOps.entryAndTriple.createTriple,
		dateNow: () => nowIso(deps.std),
		deleteEntry: runtimeOps.entryAndTriple.deleteEntry,
		deleteTriple: runtimeOps.entryAndTriple.deleteTriple,
		detectConflict: runtimeOps.detectConflict,
		efctDelete: deps.handleDelete,
		efctEnableAutoUpdates: deps.handleEnableAutoUpdates,
		efctExtractLessons: deps.handleExtractLessons,
		efctHistory: deps.handleHistory,
		efctIngest: deps.handleIngest,
		efctMergeEntities: deps.handleMergeEntities,
		efctQueryEntities: deps.handleQueryEntities,
		efctQueryGraph: deps.handleQueryGraph,
		efctQueryHybrid: deps.handleQueryHybrid,
		efctQueryPlain: deps.handleQueryPlain,
		efctRelateConflict: deps.handleRelateConflict,
		efctRelateCreate: deps.handleRelateCreate,
		efctResolveReject: deps.handleResolveReject,
		efctResolveReplace: deps.handleResolveReplace,
		efctResolveRetain: deps.handleResolveRetain,
		efctSetType: deps.handleSetType,
		efctStore: deps.handleStore,
		efctUpdate: deps.handleUpdate,
		efctUpdateTriple: deps.handleUpdateTriple,
		efctUpsertEntity: deps.handleUpsertEntity,
		efctUpsertTriple: deps.handleUpsertTriple,
		formatError: core.formatError,
		formatResult: core.formatResult,
		getHistory: runtimeOps.entityAndHistory.getHistory,
		hasLessonForHypothesis: maintenance.hasLessonForHypothesis,
		hybridSearch: runtimeOps.search.hybridSearch,
		ingestAsync: runtimeOps.ingestion.ingestAsync,
		ingestSync: runtimeOps.ingestion.ingestSync,
		isPredicateMulti: core.isPredicateMulti,
		listRefutedHypotheses: maintenance.listRefutedHypotheses,
		loadConflict: runtimeOps.loadConflict,
		logEvent: core.logEvent,
		markEmbeddingAttemptFailure: embedding.markEmbeddingAttemptFailure,
		markEmbeddingReady: embedding.markEmbeddingReady,
		mergeEntities: runtimeOps.entityAndHistory.mergeEntities,
		normalizeRepoFullName: deps.normalizeRepoFullName,
		notifyResourceChange: core.notifyResourceChange,
		promiseResolve: async (value) => value,
		queryEntries: runtimeOps.entryAndTriple.queryEntries,
		queryEntities: runtimeOps.entityAndHistory.queryEntities,
		queryTriples: runtimeOps.entryAndTriple.queryTriples,
		querySummaryCounts: () => deps.querySummaryCounts(host.db),
		randomToken,
		readAutoUpdatesInstallState:
			typeof host.readAutoUpdatesInstallState === "function"
				? () => host.readAutoUpdatesInstallState()
				: undefined,
		removeConflict: runtimeOps.conflictRemove,
		resolveAutoUpdatesInstallContext:
			typeof host.resolveAutoUpdatesInstallContext === "function"
				? () => host.resolveAutoUpdatesInstallContext()
				: undefined,
		resolveEnableAutoUpdatesBaseUrl: (requestHeaders) => deps.resolveEnableAutoUpdatesBaseUrl(requestHeaders),
		runMemoryGc: maintenance.runMemoryGc,
		saveConflict: runtimeOps.conflictSave,
		setEmbeddingPending: embedding.setEmbeddingPending,
		setEntryTypes: runtimeOps.entryAndTriple.setEntryTypes,
		shouldProcessAsync: runtimeOps.ingestion.shouldProcessAsync,
		syncEmbedding: runtimeOps.search.syncEmbedding,
		throwNotFound: throwNotFoundValue,
		timeNowForTimezone: (timezone, now) => formatNowForTimezone(timezone, now, deps.std),
		updateAndEmbed: embedding.updateAndEmbed,
		updateEntry: runtimeOps.entryAndTriple.updateEntry,
		updateTriple: runtimeOps.entryAndTriple.updateTriple,
		upsertEntity: runtimeOps.entityAndHistory.upsertEntity,
		upsertTriple: runtimeOps.entryAndTriple.upsertTriple,
		validatePromotionRelation: maintenance.validatePromotionRelation,
		validateTimezone: (timezone) => validateTimezoneValue(timezone, deps.std),
		vectorizeDeleteByIds: host.vectorizeDeleteByIds,
		issueAutoUpdatesSetupToken: host.issueAutoUpdatesSetupToken,
		};
	}

export { buildToolsDeps };
