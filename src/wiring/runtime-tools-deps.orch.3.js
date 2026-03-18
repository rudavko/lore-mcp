/** @implements FR-001 — MCP tool dependency assembly from configured runtime operations. */
import {
	formatNowForTimezone,
	nowIso,
	parsePositiveInteger,
	resolveBuildHash,
	throwNotFoundValue,
	validateTimezoneValue,
} from "./runtime-value-helpers.orch.3.js";
import { safeStringEqual } from "../lib/constant-time-equal.pure.js";
import { encodeUriComponentValue } from "./runtime-surface.orch.3.js";
import { createEmbeddingToolHelpers } from "./runtime-tools-embedding.orch.4.js";
import { createMaintenanceToolHelpers } from "./runtime-tools-maintenance.orch.4.js";

function buildToolsDeps(core, runtimeOps, deps, env) {
	const randomToken = () => {
		const bytes = new deps.uint8ArrayCtor(16);
		deps.cryptoLike.getRandomValues(bytes);
		return deps.byteValuesToHexString(deps.std.Array.from(bytes));
	};
	const embedding = createEmbeddingToolHelpers({
		createEntry: runtimeOps.entryAndTriple.createEntry,
		env,
		logEvent: core.logEvent,
		parsePositiveInteger,
		std: deps.std,
		syncEmbedding: runtimeOps.search.syncEmbedding,
		updateEntry: runtimeOps.entryAndTriple.updateEntry,
	});
	const maintenance = createMaintenanceToolHelpers({
		deleteEntry: runtimeOps.entryAndTriple.deleteEntry,
		env,
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
		appVersion: deps.appVersion,
		autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
		buildEnableAutoUpdatesPath: (setupToken) =>
			deps.buildEnableAutoUpdatesPath(setupToken, (value) =>
				encodeUriComponentValue(value, deps.std),
			),
		buildEnableAutoUpdatesUrl: (baseUrl, setupToken) =>
			deps.buildEnableAutoUpdatesUrl(baseUrl, setupToken, (value) =>
				encodeUriComponentValue(value, deps.std),
			),
		buildHash: resolveBuildHash(env),
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
		efctIngestionStatus: deps.handleIngestionStatus,
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
		efctUndo: deps.handleUndo,
		efctUpdate: deps.handleUpdate,
		efctUpdateTriple: deps.handleUpdateTriple,
		efctUpsertEntity: deps.handleUpsertEntity,
		efctUpsertTriple: deps.handleUpsertTriple,
		formatError: core.formatError,
		formatResult: core.formatResult,
		getHistory: runtimeOps.entityAndHistory.getHistory,
		getIngestionStatus: runtimeOps.ingestion.getIngestionStatus,
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
		randomToken,
		removeConflict: runtimeOps.conflictRemove,
		resolveAutoUpdatesTargetRepo: async () => {
			const envTargetRepo = typeof env.TARGET_REPO === "string" ? env.TARGET_REPO : "";
			return deps.normalizeRepoFullName(envTargetRepo) || "";
		},
		resolveEnableAutoUpdatesBaseUrl: (requestHeaders) => deps.resolveEnableAutoUpdatesBaseUrl(requestHeaders),
		runMemoryGc: maintenance.runMemoryGc,
		saveConflict: runtimeOps.conflictSave,
		setEmbeddingPending: embedding.setEmbeddingPending,
		setEntryTypes: runtimeOps.entryAndTriple.setEntryTypes,
		shouldProcessAsync: runtimeOps.ingestion.shouldProcessAsync,
		syncEmbedding: runtimeOps.search.syncEmbedding,
		throwNotFound: throwNotFoundValue,
		timeNowForTimezone: (timezone, now) => formatNowForTimezone(timezone, now, deps.std),
		undoTransactions: runtimeOps.entityAndHistory.undoTransactions,
		updateAndEmbed: embedding.updateAndEmbed,
		updateEntry: runtimeOps.entryAndTriple.updateEntry,
		updateTriple: runtimeOps.entryAndTriple.updateTriple,
		upsertEntity: runtimeOps.entityAndHistory.upsertEntity,
		upsertTriple: runtimeOps.entryAndTriple.upsertTriple,
		validatePromotionRelation: maintenance.validatePromotionRelation,
		validateTimezone: (timezone) => validateTimezoneValue(timezone, deps.std),
		vectorizeDeleteByIds: env.VECTORIZE_INDEX ? (ids) => env.VECTORIZE_INDEX.deleteByIds(ids) : undefined,
		issueAutoUpdatesSetupToken: (targetRepo, expiresAtMs) =>
			deps.issueAutoUpdatesSetupToken(targetRepo, expiresAtMs, {
				accessPassphrase: typeof env.ACCESS_PASSPHRASE === "string" ? env.ACCESS_PASSPHRASE : "",
				cryptoLike: deps.cryptoLike,
				textEncoderCtor: deps.textEncoderCtor,
				textDecoderCtor: deps.textDecoderCtor,
				uint8ArrayCtor: deps.uint8ArrayCtor,
				arrayFrom: deps.std.Array.from,
				stringFromCharCode: deps.std.String.fromCharCode,
					numberIsFinite: deps.std.Number.isFinite,
					btoa: deps.std.btoa,
					atob: deps.std.atob,
					jsonStringify: deps.jsonStringify,
					jsonParse: deps.jsonParse,
					nowMs: deps.std.Date.now,
					safeStringEqual,
				}),
		};
	}

export { buildToolsDeps };
