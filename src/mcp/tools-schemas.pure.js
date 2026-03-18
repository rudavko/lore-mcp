/** @implements FR-015, FR-002, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012, FR-013, FR-014, FR-019, FR-020, NFR-001 — Schema definitions for MCP tool registration. */
import { knowledgeTypes, memoryTypes } from "../lib/knowledge-types.pure.js";

export const _MODULE = "tools-schemas.pure";
/** Build all tool schemas from Zod-like builder. */
export function buildToolSchemas(z) {
	const knowledgeTypeValues = knowledgeTypes();
	const memoryTypeValues = memoryTypes();
	const validFromDesc =
		"Optional start of validity interval (ISO-8601). Set when the fact became true.";
	const validToDesc =
		"Optional end of validity interval (ISO-8601). Omit for unspecified, use 'infinite' for explicitly open-ended validity.";
	const s = (desc, opt) => {
		if (opt) {
			return z.string().optional().describe(desc);
		}
		return z.string().describe(desc);
	};
	const tags = (desc) => {
		const base = z.array(z.string());
		return base.optional().describe(desc);
	};
	const confidence = (desc) => {
		const base = z.number().min(0);
		const ranged = base.max(1);
		return ranged.optional().describe(desc);
	};
	const intBase = () => {
		const n = z.number();
		return n.int();
	};
	const numLimit = (desc, mi, ma) => {
		const base = intBase();
		const lo = base.min(mi);
		const bounded = ma !== undefined ? lo.max(ma) : lo;
		return bounded.optional().describe(desc);
	};
	const ttlSeconds = (desc) => {
		const numeric = intBase().min(1);
		const stringBase = z.string();
		const stringDigits =
			typeof stringBase.regex === "function" ? stringBase.regex(/^\d+$/u) : stringBase.min(1);
		const zWithUnion = z;
		if (typeof zWithUnion.union === "function") {
			const union = zWithUnion.union([numeric, stringDigits]);
			return union.optional().describe(desc + " Accepts integer or numeric string.");
		}
		if (typeof numeric.or === "function") {
			const union = numeric.or(stringDigits);
			return union.optional().describe(desc + " Accepts integer or numeric string.");
		}
		return numeric.optional().describe(desc);
	};
	const en = (values, desc, opt) => {
		if (opt) {
			return z.enum(values).optional().describe(desc);
		}
		return z.enum(values).describe(desc);
	};
	const b = (desc, opt) => {
		const boolLike = z.boolean;
		if (typeof boolLike === "function") {
			const base = boolLike();
			if (opt) {
				return base.optional().describe(desc);
			}
			return base.describe(desc);
		}
		const enumBool = z.enum(["true", "false"]);
		if (opt) {
			return enumBool.optional().describe(desc);
		}
		return enumBool.describe(desc);
	};
	return {
		time: { timezone: s("IANA timezone, e.g. Europe/Kyiv. Defaults to UTC.", true) },
		build_info: {},
		enable_auto_updates: {},
		store: {
			topic: s("Short topic/subject label"),
			content: s("The knowledge content"),
			tags: tags("Tags for filtering"),
			source: s("Provenance source identifier", true),
			actor: s("Who/what created this", true),
			confidence: confidence("Confidence score 0-1"),
			ttl_seconds: ttlSeconds(
				"Optional time-to-live in seconds; entry expires automatically after this window",
			),
			wait_for_embedding: b(
				"Wait for embedding write to complete before returning (default: false)",
				true,
			),
			knowledge_type: en(knowledgeTypeValues, "Knowledge classification axis", true),
			memory_type: en(memoryTypeValues, "Retention axis", true),
			status: en(["active", "refuted"], "Lifecycle status", true),
			valid_from: s(validFromDesc, true),
			valid_to: s(validToDesc, true),
		},
		update: {
			id: s("Entry ID"),
			topic: s("New topic", true),
			content: s("New content", true),
			tags: tags("New tags (replaces existing)"),
			source: s("Provenance source", true),
			actor: s("Who/what updated this", true),
			confidence: confidence("Confidence score 0-1"),
			ttl_seconds: ttlSeconds(
				"Optional time-to-live in seconds; resets expiry window from update time",
			),
			wait_for_embedding: b(
				"Wait for embedding write to complete before returning (default: false)",
				true,
			),
			knowledge_type: en(knowledgeTypeValues, "Knowledge classification axis", true),
			memory_type: en(memoryTypeValues, "Retention axis", true),
			status: en(["active", "refuted"], "Lifecycle status", true),
			valid_from: s(validFromDesc, true),
			valid_to: s(validToDesc, true),
		},
		query: {
			topic: s("Filter by topic (substring)", true),
			tags: tags("Filter by tags (entry must have all)"),
			content: s("Filter by content (substring)", true),
			limit: numLimit("Max entries to return (default: 20)", 1, 200),
			cursor: s("Pagination cursor from previous response", true),
			as_of: s("Return entries valid at this timestamp (ISO-8601)", true),
			knowledge_type: en(knowledgeTypeValues, "Filter by knowledge type", true),
			memory_type: en(memoryTypeValues, "Filter by memory type", true),
			strict_substring: b(
				"When true, enforce exact substring filtering on topic/content after hybrid ranking",
				true,
			),
		},
		del: {
			id: s("Entity ID"),
			entity_type: en(["entry", "triple"], "Type of entity (default: entry)", true),
		},
		relate: {
			subject: s("Subject of the relationship"),
			predicate: s("Predicate/verb of the relationship"),
			object: s("Object of the relationship"),
			multi: b("Treat predicate as multi-valued for this write", true),
			source: s("Provenance source", true),
			actor: s("Who/what created this", true),
			confidence: confidence("Confidence score 0-1"),
			valid_from: s(validFromDesc, true),
			valid_to: s(validToDesc, true),
		},
		query_graph: {
			subject: s("Filter by subject (substring)", true),
			predicate: s("Filter by predicate (substring)", true),
			object: s("Filter by object (substring)", true),
			limit: numLimit("Max triples to return (default: 50)", 1, 200),
			cursor: s("Pagination cursor from previous response", true),
		},
		query_entities: {
			name: s("Filter by entity name (substring)", true),
			alias: s("Filter by alias (substring)", true),
			limit: numLimit("Max entities to return (default: 20)", 1, 200),
			cursor: s("Pagination cursor from previous response", true),
		},
		update_triple: {
			id: s("Triple ID"),
			predicate: s("New predicate", true),
			object: s("New object", true),
			source: s("Provenance source", true),
			actor: s("Who/what updated this", true),
			confidence: confidence("Confidence score 0-1"),
			valid_from: s(validFromDesc, true),
			valid_to: s(validToDesc, true),
		},
		upsert_triple: {
			subject: s("Subject of the relationship"),
			predicate: s("Predicate/verb"),
			object: s("Object of the relationship"),
			multi: b("Treat predicate as multi-valued for this write", true),
			source: s("Provenance source", true),
			actor: s("Who/what created this", true),
			confidence: confidence("Confidence score 0-1"),
			valid_from: s(validFromDesc, true),
			valid_to: s(validToDesc, true),
		},
		resolve_conflict: {
			conflict_id: s("Conflict ID from relate/upsert response"),
			strategy: en(["replace", "retain_both", "reject"], "Resolution strategy"),
		},
		upsert_entity: { name: s("Entity name") },
		set_type: {
			id: s("Entry ID"),
			knowledge_type: en(knowledgeTypeValues, "Set entry knowledge type", true),
			memory_type: en(memoryTypeValues, "Set entry memory type", true),
		},
		merge_entities: {
			keep_id: s("Entity ID to keep"),
			merge_id: s("Entity ID to merge into the kept one"),
		},
		extract_lessons: {
			limit: numLimit("Max refuted hypotheses to process (default: 20)", 1, 200),
		},
		undo: { count: numLimit("Number of transactions to undo (default: 1)", 1) },
		history: {
			limit: numLimit("Max entries to return (default: 20)", 1, 100),
			entity_type: en(["entry", "triple"], "Filter by entity type", true),
			cursor: s("Pagination cursor from previous response", true),
		},
		ingest: {
			content: s("Text content to ingest"),
			source: s("Provenance source identifier", true),
		},
		ingestion_status: { task_id: s("Ingestion task ID") },
	};
}
