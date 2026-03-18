/** @implements FR-001 — Ingestion-related runtime assembly for MCP server configuration. */
import { buildIngestionOps } from "./runtime-ingestion.orch.3.js";

function createIngestionRuntime({ deps, db, std, generateId, createEntry }) {
	return buildIngestionOps({
		db,
		std,
		generateId,
		createEntry,
		shouldProcessAsync: deps.shouldProcessAsync,
		ingestSyncOrch: deps.ingestSyncOrch,
		ingestAsyncOrch: deps.ingestAsyncOrch,
		processIngestionBatchOrch: deps.processIngestionBatchOrch,
		getIngestionStatusOrch: deps.getIngestionStatusOrch,
		chunkText: deps.chunkText,
		extractChunkTopic: deps.extractChunkTopic,
		maxStorableContent: deps.maxStorableContent,
	});
}

export { createIngestionRuntime };
