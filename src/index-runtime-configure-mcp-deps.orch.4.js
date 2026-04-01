/** @implements FR-001 — Configure-server MCP-surface dependency builder. */
import { registerTools } from "./mcp/tools.orch.1.js";
import { handleStore } from "./mcp/tools-entry-store.efct.js";
import { handleUpdate } from "./mcp/tools-entry-update.efct.js";
import { handleSetType, handleDelete } from "./mcp/tools-entry-admin.efct.js";
import { handleQueryHybrid } from "./mcp/tools-entry-query-hybrid.efct.js";
import { handleQueryPlain } from "./mcp/tools-entry-query-plain.efct.js";
import { handleRelateConflict, handleRelateCreate } from "./mcp/tools-graph-relate.efct.js";
import { handleUpdateTriple, handleUpsertTriple } from "./mcp/tools-graph-update.efct.js";
import { handleQueryGraph } from "./mcp/tools-graph-query.efct.js";
import {
	handleResolveReject,
	handleResolveReplace,
	handleResolveRetain,
} from "./mcp/tools-graph-resolve.efct.js";
import {
	handleUpsertEntity,
	handleMergeEntities,
	handleQueryEntities,
	handleExtractLessons,
} from "./mcp/tools-entity.efct.js";
import {
	handleHistory,
	handleIngest,
	handleEnableAutoUpdates,
} from "./mcp/tools-system.efct.js";
import { registerResources } from "./mcp/resources.efct.js";
import {
	buildIngestMemoryPrompt,
	buildRetrieveContextPrompt,
	buildCorrectStaleFactsPrompt,
} from "./mcp/prompts.pure.js";
import { resolveEntityUri, TRANSACTIONS_URI } from "./mcp/subscriptions.pure.js";
import { textResult, errorResult } from "./lib/format.pure.js";
import { jsonResource } from "./lib/format.efct.js";
import { logEvent as observeLogEvent } from "./lib/observe.efct.js";

function createConfigureLoreServerMcpDeps() {
	return {
		registerTools,
		registerResources,
		buildIngestMemoryPrompt,
		buildRetrieveContextPrompt,
		buildCorrectStaleFactsPrompt,
		resolveEntityUri,
		transactionsUri: TRANSACTIONS_URI,
		textResult,
		errorResult,
		jsonResource,
		observeLogEvent,
		handleStore,
		handleUpdate,
		handleSetType,
		handleDelete,
		handleQueryHybrid,
		handleQueryPlain,
		handleRelateConflict,
		handleRelateCreate,
		handleUpdateTriple,
		handleUpsertTriple,
		handleQueryGraph,
		handleResolveReject,
		handleResolveReplace,
		handleResolveRetain,
		handleUpsertEntity,
		handleMergeEntities,
		handleQueryEntities,
		handleExtractLessons,
		handleHistory,
		handleIngest,
		handleEnableAutoUpdates,
	};
}

export { createConfigureLoreServerMcpDeps };
