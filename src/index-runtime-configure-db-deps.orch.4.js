/** @implements FR-001 — Configure-server DB dependency builder grouped by persistence concern. */
import { toConflictInfo, DEFAULT_CONFLICT_TTL_MS } from "./db/conflicts.pure.js";
import { savePendingConflictRow, loadPendingConflictRow, removePendingConflictRow } from "./db/conflicts.efct.js";
import { makeSaveConflict, makeLoadConflictRow, makeRemoveConflict } from "./db/conflicts.ops.efct.js";
import {
	createEntry as entriesOrchCreate,
	updateEntry as entriesOrchUpdate,
	deleteEntry as entriesOrchDelete,
	queryEntries as entriesOrchQuery,
} from "./db/entries.ops.efct.js";
import {
	validateCreateEntryInput,
	resolveCreateAutoLinkState,
	buildCreateSnapshots,
	resolveTopicCanonicalEntityId,
} from "./db/entries-autolink.efct.js";
import {
	validateEntryFields,
	buildEntryObject,
	buildQueryConditions as buildEntryQueryConditions,
	rowToEntry,
} from "./db/entries.pure.js";
import {
	insertEntryRow,
	selectEntryRow,
	updateEntryRow,
	softDeleteEntryRow,
	queryEntryRows,
} from "./db/entries.efct.js";
import {
	createTriple as triplesOrchCreate,
	updateTriple as triplesOrchUpdate,
	upsertTriple as triplesOrchUpsert,
	deleteTriple as triplesOrchDelete,
	queryTriples as triplesOrchQuery,
	findActiveTriples as triplesOrchFindActive,
} from "./db/triples.ops.efct.js";
import {
	validateTripleFields,
	buildTripleObject,
	buildTripleQueryConditions,
	rowToTriple,
} from "./db/triples.pure.js";
import {
	insertTripleRow,
	selectTripleRow,
	updateTripleRow,
	softDeleteTripleRow,
	queryTripleRows,
} from "./db/triples.efct.js";
import {
	upsertEntity as upsertEntityOrch,
	mergeEntities as mergeEntitiesOrch,
	queryEntities as queryEntitiesOrch,
} from "./db/entities.ops.efct.js";
import {
	rowToEntity,
	buildEntityObject,
	buildMergeSnapshot,
	buildEntityQueryState,
	buildEntityQueryItems,
} from "./db/entities.pure.js";
import { insertEntityRow } from "./db/entities-write.efct.js";
import {
	resolveAliasRow,
	selectEntityByName,
	selectEntityRow,
	queryCanonicalEntityRows,
	queryAliasRowsByEntityIds,
	selectTripleIdsBySubject,
	selectTripleIdsByObject,
	selectEntryIdsByEntity,
	selectAliasIdsByEntity,
} from "./db/entities-read.efct.js";
import {
	undoTransactions as undoTransactionsOrch,
	getHistory as getHistoryOrch,
} from "./db/history.ops.efct.js";
import {
	rowToTransaction,
	buildHistoryQueryConditions,
	buildUndoStatements,
} from "./db/history.pure.js";
import {
	queryTransactionRows,
	selectRevertableTransactions,
	executeBatch,
} from "./db/history.efct.js";
import {
	hybridSearch as hybridSearchOrch,
	syncEmbedding as syncEmbeddingOrch,
} from "./db/search.ops.efct.js";
import {
	sanitizeFts5Query,
	redistributeWeights,
	computeTotalScore,
} from "./db/search.pure.js";
import {
	fts5SearchRows,
	likeSearchRows,
	graphNeighborRows,
	selectEntriesByIds,
} from "./db/search.efct.js";

function createConfigureLoreServerDbDeps() {
	return {
		toConflictInfo,
		defaultConflictTtlMs: DEFAULT_CONFLICT_TTL_MS,
		savePendingConflictRow,
		loadPendingConflictRow,
		removePendingConflictRow,
		makeSaveConflict,
		makeLoadConflictRow,
		makeRemoveConflict,
		entriesOrchCreate,
		entriesOrchUpdate,
		entriesOrchDelete,
		entriesOrchQuery,
		validateCreateEntryInput,
		resolveCreateAutoLinkState,
		buildCreateSnapshots,
		resolveTopicCanonicalEntityId,
		validateEntryFields,
		buildEntryObject,
		buildEntryQueryConditions,
		rowToEntry,
		insertEntryRow,
		selectEntryRow,
		updateEntryRow,
		softDeleteEntryRow,
		queryEntryRows,
		triplesOrchCreate,
		triplesOrchUpdate,
		triplesOrchUpsert,
		triplesOrchDelete,
		triplesOrchQuery,
		triplesOrchFindActive,
		validateTripleFields,
		buildTripleObject,
		buildTripleQueryConditions,
		rowToTriple,
		insertTripleRow,
		selectTripleRow,
		updateTripleRow,
		softDeleteTripleRow,
		queryTripleRows,
		upsertEntityOrch,
		mergeEntitiesOrch,
		queryEntitiesOrch,
		rowToEntity,
		buildEntityObject,
		buildMergeSnapshot,
		buildEntityQueryState,
		buildEntityQueryItems,
		insertEntityRow,
		resolveAliasRow,
		selectEntityByName,
		selectEntityRow,
		queryCanonicalEntityRows,
		queryAliasRowsByEntityIds,
		selectTripleIdsBySubject,
		selectTripleIdsByObject,
		selectEntryIdsByEntity,
		selectAliasIdsByEntity,
		undoTransactionsOrch,
		getHistoryOrch,
		rowToTransaction,
		buildHistoryQueryConditions,
		buildUndoStatements,
		queryTransactionRows,
		selectRevertableTransactions,
		executeBatch,
		hybridSearchOrch,
		syncEmbeddingOrch,
		sanitizeFts5Query,
		redistributeWeights,
		computeTotalScore,
		fts5SearchRows,
		likeSearchRows,
		graphNeighborRows,
		selectEntriesByIds,
	};
}

export { createConfigureLoreServerDbDeps };
