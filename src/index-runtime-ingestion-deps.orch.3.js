/** @implements FR-003 — Stable builder for ingestion runtime dependencies. */
import { formatUlid } from "./lib/ulid.pure.js";
import { deriveValidToStateFromInput } from "./lib/validity.pure.js";
import {
	createEntry as entriesOrchCreate,
} from "./db/entries.ops.efct.js";
import {
	validateCreateEntryInput,
	resolveCreateAutoLinkState,
	buildCreateSnapshots,
} from "./db/entries-autolink.efct.js";
import { validateEntryFields, buildEntryObject } from "./db/entries.pure.js";
import { insertEntryRow } from "./db/entries.efct.js";
import {
	syncEmbedding as syncEmbeddingOrch,
} from "./db/search.ops.efct.js";
import {
	shouldProcessAsync,
	chunkText,
	extractChunkTopic,
	MAX_STORABLE_CONTENT,
} from "./domain/ingestion.pure.js";
import {
	ingestSync as ingestSyncOrch,
	ingestAsync as ingestAsyncOrch,
	processIngestionBatch as processIngestionBatchOrch,
	getIngestionStatus as getIngestionStatusOrch,
} from "./domain/ingestion.ops.efct.js";
import { resolveEntityUri, TRANSACTIONS_URI } from "./mcp/subscriptions.pure.js";

export function createRunLoreIngestionDeps(input) {
	return {
		std: input.std,
		nowMs: Date.now,
		random: Math.random,
		formatUlid,
		entriesOrchCreate,
		validateCreateEntryInput,
		resolveCreateAutoLinkState,
		buildCreateSnapshots,
		validateEntryFields,
		deriveValidToStateFromInput,
		buildEntryObject,
		insertEntryRow,
		syncEmbeddingOrch,
		shouldProcessAsync,
		ingestSyncOrch,
		ingestAsyncOrch,
		processIngestionBatchOrch,
		getIngestionStatusOrch,
		chunkText,
		extractChunkTopic,
		maxStorableContent: MAX_STORABLE_CONTENT,
		resolveEntityUri,
		transactionsUri: TRANSACTIONS_URI,
	};
}
