/** @implements FR-001 — Tool-side maintenance helpers for relations, GC, and lessons. */
import { normalizeStatus, validationError } from "./runtime-value-helpers.orch.3.js";

function createMaintenanceToolHelpers(ctx) {
	const loadEntryTyping = async (id) => {
		const row = await ctx.env.DB
			.prepare(`SELECT knowledge_type, memory_type, status
				 FROM entries
				 WHERE id = ?
				   AND deleted_at IS NULL
				 LIMIT 1`)
			.bind(id)
			.first();
		if (
			row === null ||
			!ctx.isKnowledgeType(row.knowledge_type) ||
			!ctx.isMemoryType(row.memory_type)
		) {
			return null;
		}
		return {
			knowledge_type: row.knowledge_type,
			memory_type: row.memory_type,
			status: normalizeStatus(row.status),
		};
	};
	const validatePromotionRelation = async (params) => {
		if (!ctx.isPromotionPredicate(params.predicate)) {
			return;
		}
		if (typeof params.subject !== "string" || typeof params.object !== "string") {
			throw validationError("Promotion predicates require entry-id subject/object");
		}
		const subjectTyping = await loadEntryTyping(params.subject);
		const objectTyping = await loadEntryTyping(params.object);
		if (subjectTyping === null || objectTyping === null) {
			throw validationError("Promotion predicates require existing entry endpoints");
		}
		if (
			!ctx.isCompatiblePromotionEdge(
				params.predicate,
				subjectTyping.knowledge_type,
				objectTyping.knowledge_type,
			)
		) {
			throw validationError("Incompatible knowledge_type pair for promotion predicate");
		}
	};
	const runMemoryGc = async () => {
		const { results } = await ctx.env.DB
			.prepare(`SELECT id, knowledge_type, status
				 FROM entries
				 WHERE deleted_at IS NULL
				   AND memory_type = 'fleeting'
				   AND expires_at IS NOT NULL
				   AND datetime(expires_at) <= datetime('now')`)
			.all();
		let deleted = 0;
		let promoted = 0;
		for (let i = 0; i < results.length; i++) {
			const row = results[i];
			if (row.knowledge_type === "hypothesis" && row.status === "refuted") {
				continue;
			}
			const reference = await ctx.env.DB
				.prepare(`SELECT 1
					 FROM triples t
					 JOIN entries e ON e.id = t.subject
					 WHERE t.deleted_at IS NULL
					   AND t.predicate IN (?, ?, ?)
					   AND t.object = ?
					   AND e.deleted_at IS NULL
					   AND e.memory_type IN ('factual', 'core')
					 LIMIT 1`)
				.bind("supported_by", "grounded_by", "derived_from", row.id)
				.first();
			if (reference !== null) {
				await ctx.setEntryTypes(row.id, { memory_type: "factual" });
				promoted += 1;
				continue;
			}
			await ctx.deleteEntry(row.id);
			deleted += 1;
		}
		return { deleted, promoted };
	};
	const listRefutedHypotheses = async (limit) => {
		const safeLimit = ctx.std.Number.isInteger(limit) && limit > 0 ? limit : 20;
		const { results } = await ctx.env.DB
			.prepare(`SELECT id, topic, content
				 FROM entries
				 WHERE deleted_at IS NULL
				   AND knowledge_type = 'hypothesis'
				   AND status = 'refuted'
				 ORDER BY updated_at DESC
				 LIMIT ?`)
			.bind(safeLimit)
			.all();
		return results;
	};
	const hasLessonForHypothesis = async (hypothesisId) => {
		const row = await ctx.env.DB
			.prepare(`SELECT 1
				 FROM triples t
				 JOIN entries e ON e.id = t.subject
				 WHERE t.deleted_at IS NULL
				   AND t.predicate = 'derived_from'
				   AND t.object = ?
				   AND e.deleted_at IS NULL
				   AND e.knowledge_type = 'lesson'
				 LIMIT 1`)
			.bind(hypothesisId)
			.first();
		return row !== null;
	};
	return {
		hasLessonForHypothesis,
		listRefutedHypotheses,
		runMemoryGc,
		validatePromotionRelation,
	};
}

export { createMaintenanceToolHelpers };
