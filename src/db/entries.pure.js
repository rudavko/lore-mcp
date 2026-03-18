/** @implements FR-001, FR-003 — Pure entry validation, normalization, and row mapping helpers. */
import { deriveValidToStateFromInput, normalizeValidToState } from "../lib/validity.pure.js";
import { isKnowledgeType, isMemoryType } from "../lib/knowledge-types.pure.js";
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
function isIso8601(value) {
	return ISO_8601_RE.test(value);
}
export function validateEntryFields(params) {
	if (params.topic !== undefined && params.topic.length > 1000) {
		return { ok: false, error: validationErr("Topic exceeds 1000 characters") };
	}
	if (params.content !== undefined && params.content.length > 100_000) {
		return { ok: false, error: validationErr("Content exceeds 100000 characters") };
	}
	if (params.ttl_seconds !== undefined && params.ttl_seconds !== null) {
		const ttl = params.ttl_seconds;
		const isInteger = typeof ttl === "number" && ttl === ttl && ttl % 1 === 0;
		if (!isInteger || ttl <= 0) {
			return { ok: false, error: validationErr("ttl_seconds must be a positive integer") };
		}
	}
	if (params.valid_from !== undefined && params.valid_from !== null) {
		if (!isIso8601(params.valid_from)) {
			return { ok: false, error: validationErr("valid_from must be ISO-8601") };
		}
	}
	const normalizedValidTo = deriveValidToStateFromInput(params.valid_to).validTo;
	if (normalizedValidTo !== undefined && normalizedValidTo !== null) {
		if (!isIso8601(normalizedValidTo)) {
			return { ok: false, error: validationErr("valid_to must be ISO-8601") };
		}
	}
	if (params.knowledge_type !== undefined && !isKnowledgeType(params.knowledge_type)) {
		return { ok: false, error: validationErr("knowledge_type is invalid") };
	}
	if (
		params.knowledge_type === "assumption" &&
		params.confidence !== undefined &&
		params.confidence !== null
	) {
		return {
			ok: false,
			error: validationErr("knowledge_type=assumption requires confidence=null"),
		};
	}
	if (
		params.knowledge_type === "assumption" &&
		typeof params.source === "string" &&
		params.source.length > 0
	) {
		return {
			ok: false,
			error: validationErr("knowledge_type=assumption requires source to be omitted"),
		};
	}
	if (params.memory_type !== undefined && !isMemoryType(params.memory_type)) {
		return { ok: false, error: validationErr("memory_type is invalid") };
	}
	if (params.status !== undefined && params.status !== "active" && params.status !== "refuted") {
		return { ok: false, error: validationErr("status is invalid") };
	}
	return { ok: true, value: undefined };
}
export function rowToEntry(r, tags) {
	const validTo = r.valid_to ?? null;
	return {
		id: r.id,
		topic: r.topic,
		content: r.content,
		tags,
		source: r.source ?? null,
		actor: r.actor ?? null,
		confidence: r.confidence ?? null,
		valid_from: r.valid_from ?? null,
		valid_to: validTo,
		valid_to_state: normalizeValidToState(r.valid_to_state, validTo),
		expires_at: r.expires_at ?? null,
		status: r.status ?? "active",
		knowledge_type: isKnowledgeType(r.knowledge_type) ? r.knowledge_type : "observation",
		memory_type: isMemoryType(r.memory_type) ? r.memory_type : "fleeting",
		canonical_entity_id: r.canonical_entity_id ?? null,
		created_at: r.created_at,
		updated_at: r.updated_at,
	};
}
export function buildEntryObject(id, params, now) {
	const normalizedValidity = deriveValidToStateFromInput(params.valid_to ?? null);
	return {
		id,
		topic: params.topic,
		content: params.content,
		tags: params.tags ?? [],
		source: params.source ?? null,
		actor: params.actor ?? null,
		confidence: params.confidence ?? null,
		valid_from: params.valid_from ?? null,
		valid_to: normalizedValidity.validTo ?? null,
		valid_to_state: params.valid_to_state ?? normalizedValidity.validToState,
		expires_at: params.expires_at ?? null,
		status: params.status ?? "active",
		knowledge_type: params.knowledge_type ?? "observation",
		memory_type: params.memory_type ?? "fleeting",
		canonical_entity_id: params.canonical_entity_id ?? null,
		created_at: now,
		updated_at: now,
	};
}
export function buildQueryConditions(params, decodedCursor) {
	const conditions = ["deleted_at IS NULL"];
	const binds = [];
	conditions.push(
		"(expires_at IS NULL OR datetime(expires_at) > datetime('now') OR (knowledge_type = 'hypothesis' AND status = 'refuted'))",
	);
	if (decodedCursor) {
		conditions.push("id < ?");
		binds.push(decodedCursor);
	}
	if (params.topic) {
		conditions.push("topic LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.topic)}%`);
	}
	if (params.content) {
		conditions.push("content LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeLike(params.content)}%`);
	}
	if (params.knowledge_type) {
		conditions.push("knowledge_type = ?");
		binds.push(params.knowledge_type);
	}
	if (params.memory_type) {
		conditions.push("memory_type = ?");
		binds.push(params.memory_type);
	}
	if (params.as_of) {
		conditions.push("(valid_from IS NULL OR datetime(valid_from) <= datetime(?))");
		conditions.push("(valid_to IS NULL OR datetime(valid_to) >= datetime(?))");
		binds.push(params.as_of, params.as_of);
	}
	return { conditions, binds };
}
function escapeLike(s) {
	return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
function validationErr(message) {
	return { code: "validation", message, retryable: false };
}
