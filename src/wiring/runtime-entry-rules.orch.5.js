/** @implements FR-001 — Entry-specific rule enforcement shared by runtime CRUD wiring. */
import { normalizeStatus, validationError } from "./runtime-value-helpers.orch.3.js";

async function countSupportTriples(db, entryId, countRowsValue, std) {
	const row = await db
		.prepare(`SELECT COUNT(*) AS c
			 FROM triples
			 WHERE subject = ?
			   AND predicate = 'supported_by'
			   AND deleted_at IS NULL`)
		.bind(entryId)
		.first();
	return countRowsValue(row, std);
}

async function loadEntryKnowledgeType(db, entryId, isKnowledgeType) {
	const row = await db
		.prepare(`SELECT knowledge_type
			 FROM entries
			 WHERE id = ?
			   AND deleted_at IS NULL
			 LIMIT 1`)
		.bind(entryId)
		.first();
	if (row === null || !isKnowledgeType(row.knowledge_type)) {
		return null;
	}
	return row.knowledge_type;
}

async function enforcePromotionEdgeCompatibilityForTypeChange(ctx, entryId, nextKnowledgeType) {
	if (!ctx.isKnowledgeType(nextKnowledgeType)) {
		throw validationError("knowledge_type is invalid");
	}
	const placeholders = ctx.promotionPredicates.map(() => "?").join(",");
	const { results } = await ctx.db
		.prepare(`SELECT subject, predicate, object
			 FROM triples
			 WHERE deleted_at IS NULL
			   AND predicate IN (${placeholders})
			   AND (subject = ? OR object = ?)`)
		.bind(...ctx.promotionPredicates, entryId, entryId)
		.all();
	const cachedTypes = {};
	const resolveType = async (id) => {
		if (cachedTypes[id] !== undefined) {
			return cachedTypes[id];
		}
		const resolved = await loadEntryKnowledgeType(ctx.db, id, ctx.isKnowledgeType);
		cachedTypes[id] = resolved;
		return resolved;
	};
	for (let i = 0; i < results.length; i++) {
		const triple = results[i];
		const subjectId = typeof triple.subject === "string" ? triple.subject : null;
		const objectId = typeof triple.object === "string" ? triple.object : null;
		if (!ctx.isPromotionPredicate(triple.predicate) || subjectId === null || objectId === null) {
			throw validationError("Promotion predicates require entry-id subject/object");
		}
		const subjectType = subjectId === entryId ? nextKnowledgeType : await resolveType(subjectId);
		const objectType = objectId === entryId ? nextKnowledgeType : await resolveType(objectId);
		if (
			subjectType === null ||
			objectType === null ||
			!ctx.isKnowledgeType(subjectType) ||
			!ctx.isKnowledgeType(objectType)
		) {
			throw validationError("Promotion predicates require existing entry endpoints");
		}
		if (!ctx.isCompatiblePromotionEdge(triple.predicate, subjectType, objectType)) {
			throw validationError(
				"knowledge_type change violates promotion predicate compatibility",
			);
		}
	}
}

async function enforceKnowledgeAndStatusRules(ctx, entryId, existing, input) {
	let knowledgeType = typeof existing?.knowledge_type === "string" ? existing.knowledge_type : "observation";
	if (typeof input.knowledge_type === "string") {
		knowledgeType = input.knowledge_type;
	}
	const source = input.source !== undefined ? input.source : existing?.source;
	const confidence = input.confidence !== undefined ? input.confidence : existing?.confidence;
	const status = normalizeStatus(input.status !== undefined ? input.status : existing?.status);
	if (knowledgeType === "evidence" && (typeof source !== "string" || source.length === 0)) {
		throw validationError("knowledge_type=evidence requires source");
	}
	let normalizedInput = input;
	if (knowledgeType === "assumption") {
		if ("confidence" in input && input.confidence !== null) {
			throw validationError("knowledge_type=assumption requires confidence=null");
		}
		if ("source" in input && typeof input.source === "string" && input.source.length > 0) {
			throw validationError("knowledge_type=assumption requires source to be omitted");
		}
		if (confidence !== null) {
			normalizedInput = { ...normalizedInput, confidence: null };
		}
		if (typeof source === "string" && source.length > 0) {
			normalizedInput = { ...normalizedInput, source: null };
		}
	}
	if (knowledgeType === "fact") {
		const hasPerfectConfidence = confidence === 1;
		const hasSupport =
			entryId !== null
				? (await countSupportTriples(ctx.db, entryId, ctx.countRowsValue, ctx.std)) > 0
				: false;
		if (!hasPerfectConfidence || !hasSupport) {
			normalizedInput = { ...normalizedInput, knowledge_type: "hypothesis" };
		}
	}
	const finalKnowledgeType =
		typeof normalizedInput.knowledge_type === "string"
			? normalizedInput.knowledge_type
			: knowledgeType;
	if (status === "refuted" && finalKnowledgeType !== "hypothesis") {
		throw validationError("status=refuted is only valid for knowledge_type=hypothesis");
	}
	return normalizedInput;
}

function filterByTags(std, items, tags) {
	if (!tags || tags.length === 0) {
		return items;
	}
	const filtered = [];
	for (let i = 0; i < items.length; i++) {
		const itemTags = std.Array.isArray(items[i].tags) ? items[i].tags : [];
		let all = true;
		for (let j = 0; j < tags.length; j++) {
			let found = false;
			for (let k = 0; k < itemTags.length; k++) {
				if (itemTags[k] === tags[j]) {
					found = true;
					break;
				}
			}
			if (!found) {
				all = false;
				break;
			}
		}
		if (all) {
			filtered.push(items[i]);
		}
	}
	return filtered;
}

export {
	enforceKnowledgeAndStatusRules,
	enforcePromotionEdgeCompatibilityForTypeChange,
	filterByTags,
};
