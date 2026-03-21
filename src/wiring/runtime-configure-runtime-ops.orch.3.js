/** @implements FR-001 — Runtime operation builders used during MCP server configuration. */
import { buildEntryAndTripleOps } from "./runtime-entry-triple.orch.3.js";
import { buildEntityAndHistoryOps } from "./runtime-entity-history.orch.3.js";
import { makeGraphAndSearchOps } from "./runtime-search.orch.3.js";
import {
	makeResolveCanonicalEntityId,
	makeResolveCanonicalEntityIdForCreate,
} from "./runtime-resolve-entity.orch.4.js";
import { createConflictOps } from "./runtime-configure-conflicts.orch.4.js";
import { createEntryWithEmbeddingRuntime } from "./runtime-configure-embedding.orch.4.js";
import { createIngestionRuntime } from "./runtime-configure-ingestion.orch.4.js";

function createRuntimeOps(core, deps, env) {
	const std = deps.std;
	const resolveCanonicalEntityIdForCreate = makeResolveCanonicalEntityIdForCreate({
		db: env.DB,
		generateId: core.generateId,
		resolveAliasRow: deps.resolveAliasRow,
		selectEntityByName: deps.selectEntityByName,
	});
	const resolveCanonicalEntityId = makeResolveCanonicalEntityId({
		db: env.DB,
		generateId: core.generateId,
		resolveAliasRow: deps.resolveAliasRow,
		selectEntityByName: deps.selectEntityByName,
		std,
	});
	const entryAndTriple = buildEntryAndTripleOps({
		db: env.DB,
		std,
		generateId: core.generateId,
		mapEntryRow: core.mapEntryRow,
		resolveCanonicalEntityIdForCreate,
		resolveCanonicalEntityId,
		entriesOrchCreate: deps.entriesOrchCreate,
		entriesOrchUpdate: deps.entriesOrchUpdate,
		entriesOrchDelete: deps.entriesOrchDelete,
		entriesOrchQuery: deps.entriesOrchQuery,
		triplesOrchCreate: deps.triplesOrchCreate,
		triplesOrchUpdate: deps.triplesOrchUpdate,
		triplesOrchUpsert: deps.triplesOrchUpsert,
		triplesOrchDelete: deps.triplesOrchDelete,
		triplesOrchQuery: deps.triplesOrchQuery,
		triplesOrchFindActive: deps.triplesOrchFindActive,
		validateEntryFields: deps.validateEntryFields,
		validateCreateEntryInput: deps.validateCreateEntryInput,
		deriveValidToStateFromInput: deps.deriveValidToStateFromInput,
		resolveCreateAutoLinkState: deps.resolveCreateAutoLinkState,
		resolveTopicCanonicalEntityId: deps.resolveTopicCanonicalEntityId,
		buildCreateSnapshots: deps.buildCreateSnapshots,
		buildEntryObject: deps.buildEntryObject,
		insertEntryRow: deps.insertEntryRow,
		selectEntryRow: deps.selectEntryRow,
		updateEntryRow: deps.updateEntryRow,
		softDeleteEntryRow: deps.softDeleteEntryRow,
		queryEntryRows: deps.queryEntryRows,
		buildEntryQueryConditions: deps.buildEntryQueryConditions,
		rowToEntry: deps.rowToEntry,
		validateTripleFields: deps.validateTripleFields,
		isKnowledgeType: deps.isKnowledgeType,
		isPromotionPredicate: deps.isPromotionPredicate,
		isCompatiblePromotionEdge: deps.isCompatiblePromotionEdge,
		promotionPredicates: deps.promotionPredicates,
		deriveValidToStateFromInputForTriple: deps.deriveValidToStateFromInput,
		buildTripleObject: deps.buildTripleObject,
		insertTripleRow: deps.insertTripleRow,
		selectTripleRow: deps.selectTripleRow,
		updateTripleRow: deps.updateTripleRow,
		softDeleteTripleRow: deps.softDeleteTripleRow,
		queryTripleRows: deps.queryTripleRows,
		buildTripleQueryConditions: deps.buildTripleQueryConditions,
		rowToTriple: deps.rowToTriple,
	});
	const entityAndHistory = buildEntityAndHistoryOps({
		db: env.DB,
		std,
		generateId: core.generateId,
		upsertEntityOrch: deps.upsertEntityOrch,
		mergeEntitiesOrch: deps.mergeEntitiesOrch,
		undoTransactionsOrch: deps.undoTransactionsOrch,
		getHistoryOrch: deps.getHistoryOrch,
		queryEntitiesOrch: deps.queryEntitiesOrch,
		rowToEntity: deps.rowToEntity,
		buildEntityObject: deps.buildEntityObject,
		buildMergeSnapshot: deps.buildMergeSnapshot,
		buildEntityQueryState: deps.buildEntityQueryState,
		buildEntityQueryItems: deps.buildEntityQueryItems,
		insertEntityRow: deps.insertEntityRow,
		updateEntityRow: deps.updateEntityRow,
		resolveAliasRow: deps.resolveAliasRow,
		selectEntityByName: deps.selectEntityByName,
		selectEntityRow: deps.selectEntityRow,
		queryCanonicalEntityRows: deps.queryCanonicalEntityRows,
		queryAliasRowsByEntityIds: deps.queryAliasRowsByEntityIds,
		selectTripleIdsBySubject: deps.selectTripleIdsBySubject,
		selectTripleIdsByObject: deps.selectTripleIdsByObject,
		selectEntryIdsByEntity: deps.selectEntryIdsByEntity,
		selectAliasIdsByEntity: deps.selectAliasIdsByEntity,
		queryTransactionRows: deps.queryTransactionRows,
		selectRevertableTransactions: deps.selectRevertableTransactions,
		executeBatch: deps.executeBatch,
		rowToTransaction: deps.rowToTransaction,
		buildHistoryQueryConditions: deps.buildHistoryQueryConditions,
		buildUndoStatements: deps.buildUndoStatements,
	});
	const search = makeGraphAndSearchOps({
		db: env.DB,
		env,
		std,
		mapEntryRow: core.mapEntryRow,
		sanitizeFts5Query: deps.sanitizeFts5Query,
		computeTotalScore: deps.computeTotalScore,
		redistributeWeights: deps.redistributeWeights,
		fts5SearchRows: deps.fts5SearchRows,
		likeSearchRows: deps.likeSearchRows,
		graphNeighborRows: deps.graphNeighborRows,
		selectEntriesByIds: deps.selectEntriesByIds,
		hybridSearchOrch: deps.hybridSearchOrch,
		syncEmbeddingOrch: deps.syncEmbeddingOrch,
	});
	const { conflictRemove, conflictSave, detectConflict, loadConflict } = createConflictOps({
		deps,
		std,
		db: env.DB,
		generateId: core.generateId,
		findActiveTriples: entryAndTriple.findActiveTriples,
	});
	const createEntryWithEmbedding = createEntryWithEmbeddingRuntime({
		db: env.DB,
		env,
		std,
		createEntry: entryAndTriple.createEntry,
		syncEmbedding: search.syncEmbedding,
	});
	const ingestion = createIngestionRuntime({
		deps,
		db: env.DB,
		std,
		generateId: core.generateId,
		createEntry: createEntryWithEmbedding,
	});
	return {
		conflictRemove,
		conflictSave,
		detectConflict,
		entryAndTriple,
		entityAndHistory,
		ingestion,
		loadConflict,
		search,
	};
}

export { createRuntimeOps };
