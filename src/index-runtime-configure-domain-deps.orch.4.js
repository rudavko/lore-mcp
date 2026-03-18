/** @implements FR-001 — Configure-server domain dependency builder grouped by business concern. */
import {
	AUTO_UPDATES_LINK_TTL_SECONDS,
	buildEnableAutoUpdatesPath,
	buildEnableAutoUpdatesUrl,
	resolveEnableAutoUpdatesBaseUrl,
} from "./domain/auto-updates-link.pure.js";
import { createPolicyChecker } from "./domain/policy.ops.efct.js";
import {
	defaultRequiredFields,
	validateRequiredFields,
	validateMinConfidence,
} from "./domain/policy.pure.js";
import { detectConflict as detectConflictOrch } from "./domain/conflict.ops.efct.js";
import { findConflictingTriple, buildConflictInfo } from "./domain/conflict.pure.js";
import { normalizeRepoFullName } from "./domain/github-workflow.pure.js";
import { issueAutoUpdatesSetupToken as issueAutoUpdatesSetupTokenEfct } from "./domain/auto-updates-token.efct.js";
import {
	signPayloadBase64Url,
	encodeTokenPayload,
	decodeTokenPayload,
} from "./domain/auto-updates-token-codec.efct.js";
import {
	ingestSync as ingestSyncOrch,
	ingestAsync as ingestAsyncOrch,
	processIngestionBatch as processIngestionBatchOrch,
	getIngestionStatus as getIngestionStatusOrch,
} from "./domain/ingestion.ops.efct.js";
import {
	shouldProcessAsync,
	chunkText,
	extractChunkTopic,
	MAX_STORABLE_CONTENT,
} from "./domain/ingestion.pure.js";
import { formatUlid } from "./lib/ulid.pure.js";
import { deriveValidToStateFromInput } from "./lib/validity.pure.js";
import {
	isCompatiblePromotionEdge,
	isKnowledgeType,
	isMemoryType,
	isPromotionPredicate,
	promotionPredicates,
} from "./lib/knowledge-types.pure.js";

function createConfigureLoreServerDomainDeps() {
	return {
		autoUpdatesLinkTtlSeconds: AUTO_UPDATES_LINK_TTL_SECONDS,
		buildEnableAutoUpdatesPath,
		buildEnableAutoUpdatesUrl,
		resolveEnableAutoUpdatesBaseUrl,
		createPolicyChecker,
		defaultRequiredFields: defaultRequiredFields(),
		validateRequiredFields,
		validateMinConfidence,
		detectConflictOrch,
		findConflictingTriple,
		buildConflictInfo,
		normalizeRepoFullName,
		issueAutoUpdatesSetupTokenEfct,
		signPayloadBase64Url,
		encodeTokenPayload,
		decodeTokenPayload,
		ingestSyncOrch,
		ingestAsyncOrch,
		processIngestionBatchOrch,
		getIngestionStatusOrch,
		shouldProcessAsync,
		chunkText,
		extractChunkTopic,
		maxStorableContent: MAX_STORABLE_CONTENT,
		formatUlid,
		deriveValidToStateFromInput,
		isCompatiblePromotionEdge,
		isKnowledgeType,
		isMemoryType,
		isPromotionPredicate,
		promotionPredicates: promotionPredicates(),
	};
}

export { createConfigureLoreServerDomainDeps };
