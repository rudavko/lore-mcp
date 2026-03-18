/** @implements FR-001 — Entry CRUD/query runtime orchestration. */
import {
	decodeCursor,
	encodeCursor,
	jsonStringifyOrNull,
	noThrowValidation,
	normalizeEntryTtlParam,
	nowIso,
	throwNotFoundValue,
	validationError,
	computeExpiresAt,
	countRowsValue,
} from "./runtime-value-helpers.orch.3.js";
import { makeBuildEntryMapper } from "./runtime-surface.orch.3.js";
import {
	enforceKnowledgeAndStatusRules,
	enforcePromotionEdgeCompatibilityForTypeChange,
	filterByTags,
} from "./runtime-entry-rules.orch.5.js";

function buildEntryOps(ctx) {
	const mapEntryRow =
		typeof ctx.mapEntryRow === "function"
			? ctx.mapEntryRow
			: makeBuildEntryMapper(ctx.rowToEntry, ctx.std);
	const fetchExistingEntry = async (id) => {
		const row = await ctx.selectEntryRow(ctx.db, id);
		if (row === null) {
			throw throwNotFoundValue("Entry", id);
		}
		return mapEntryRow(row);
	};
	const persistEntryUpdate = async (existing, merged, txId, now) => {
		await ctx.updateEntryRow({
			db: ctx.db,
			id: existing.id,
			txId,
			topic: merged.topic,
			content: merged.content,
			tagsJson: jsonStringifyOrNull(merged.tags || [], ctx.std),
			source: merged.source ?? null,
			actor: merged.actor ?? null,
			confidence: merged.confidence ?? null,
			validFrom: merged.valid_from ?? null,
			validTo: merged.valid_to ?? null,
			validToState: merged.valid_to_state ?? "unspecified",
			expiresAt: merged.expires_at ?? null,
			knowledgeType: merged.knowledge_type ?? "observation",
			memoryType: merged.memory_type ?? "fleeting",
			status: merged.status ?? "active",
			canonicalEntityId: merged.canonical_entity_id ?? null,
			beforeSnapshot: jsonStringifyOrNull(existing, ctx.std),
			afterSnapshot: jsonStringifyOrNull(merged, ctx.std),
			now,
		});
	};
	const validateEntryInput = (params) => {
		const validation = ctx.validateEntryFields({
			topic: params.topic,
			content: params.content,
			source: params.source ?? undefined,
			confidence: params.confidence ?? undefined,
			ttl_seconds: params.ttl_seconds ?? undefined,
			valid_from: params.valid_from ?? undefined,
			valid_to: params.valid_to ?? undefined,
			valid_to_state: params.valid_to_state ?? undefined,
			knowledge_type: params.knowledge_type,
			memory_type: params.memory_type,
			status: params.status,
		});
		if (!validation.ok) {
			throw validationError((validation.error && validation.error.message) || "Invalid entry");
		}
	};
	const createEntry = async (params) => {
		const normalized = await enforceKnowledgeAndStatusRules(
			{
				db: ctx.db,
				std: ctx.std,
				countRowsValue,
				isKnowledgeType: ctx.isKnowledgeType,
				isPromotionPredicate: ctx.isPromotionPredicate,
				isCompatiblePromotionEdge: ctx.isCompatiblePromotionEdge,
				promotionPredicates: ctx.promotionPredicates,
			},
			null,
			null,
			normalizeEntryTtlParam(params, ctx.std),
		);
		validateEntryInput(normalized);
		return await ctx.entriesOrchCreate(normalized, {
			validateEntryFields: ctx.validateEntryFields,
			validateCreateEntryInput: ctx.validateCreateEntryInput,
			deriveValidToStateFromInput: ctx.deriveValidToStateFromInput,
			resolveCreateAutoLinkState: ctx.resolveCreateAutoLinkState,
			buildCreateSnapshots: ctx.buildCreateSnapshots,
			resolveCanonicalEntityIdForCreate: ctx.resolveCanonicalEntityIdForCreate,
			resolveCanonicalEntityId: ctx.resolveCanonicalEntityId,
			buildEntryObject: ctx.buildEntryObject,
			insertEntryRow: ctx.insertEntryRow,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			computeExpiresAt: (startIso, ttlSeconds) =>
				computeExpiresAt(startIso, ttlSeconds * 1000, ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
			throwValidation: noThrowValidation,
		});
	};
	const updateEntry = async (id, params) => {
		const existing = await fetchExistingEntry(id);
		if (typeof params.knowledge_type === "string" && params.knowledge_type !== existing.knowledge_type) {
			await enforcePromotionEdgeCompatibilityForTypeChange(
				{
					db: ctx.db,
					std: ctx.std,
					isKnowledgeType: ctx.isKnowledgeType,
					isPromotionPredicate: ctx.isPromotionPredicate,
					isCompatiblePromotionEdge: ctx.isCompatiblePromotionEdge,
					promotionPredicates: ctx.promotionPredicates,
					countRowsValue,
				},
				id,
				params.knowledge_type,
			);
		}
		const normalized = await enforceKnowledgeAndStatusRules(
			{
				db: ctx.db,
				std: ctx.std,
				countRowsValue,
				isKnowledgeType: ctx.isKnowledgeType,
				isPromotionPredicate: ctx.isPromotionPredicate,
				isCompatiblePromotionEdge: ctx.isCompatiblePromotionEdge,
				promotionPredicates: ctx.promotionPredicates,
			},
			id,
			existing,
			normalizeEntryTtlParam(params, ctx.std),
		);
		validateEntryInput(normalized);
		return await ctx.entriesOrchUpdate(id, normalized, {
			fetchExistingEntry: async () => existing,
			validateEntryFields: ctx.validateEntryFields,
			deriveValidToStateFromInput: ctx.deriveValidToStateFromInput,
			resolveCanonicalEntityId: ctx.resolveCanonicalEntityId,
			resolveTopicCanonicalEntityId: ctx.resolveTopicCanonicalEntityId,
			persistUpdate: persistEntryUpdate,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			computeExpiresAt: (startIso, ttlSeconds) =>
				computeExpiresAt(startIso, ttlSeconds * 1000, ctx.std),
			throwValidation: noThrowValidation,
		});
	};
	const deleteEntry = async (id) => {
		await ctx.entriesOrchDelete(id, {
			fetchExistingEntry,
			softDeleteEntryRow: ctx.softDeleteEntryRow,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
		});
	};
	const queryEntries = async (params) => {
		return await ctx.entriesOrchQuery(params, {
			buildWhereClause: (p, decoded) => {
				const q = ctx.buildEntryQueryConditions(p, decoded);
				return { whereClause: q.conditions.join(" AND "), binds: q.binds };
			},
			queryEntryRows: ctx.queryEntryRows,
			mapRows: (rows) => {
				const mapped = [];
				for (let i = 0; i < rows.length; i++) {
					mapped.push(mapEntryRow(rows[i]));
				}
				return mapped;
			},
			filterByTags: (items, tags) => filterByTags(ctx.std, items, tags),
			decodeCursor: (raw) => decodeCursor(raw, ctx.std),
			encodeCursor: (value) => encodeCursor(value, ctx.std),
			db: ctx.db,
		});
	};
	return { createEntry, deleteEntry, fetchExistingEntry, queryEntries, updateEntry };
}

export { buildEntryOps };
