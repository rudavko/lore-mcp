/** @implements FR-012, FR-013, FR-014 — Effects-backed entity and lesson-extraction MCP tool handlers. */
/** Sentinel for TDD hook. */
export const _MODULE = "tools-entity.efct";
/** Handle "upsert_entity" tool. */
export async function handleUpsertEntity(args, deps) {
	const result = await deps.upsertEntity(args.name);
	if (result.created) {
		deps.notifyResourceChange("entity");
	}
	return deps.formatResult(
		result.created
			? "Created entity " + result.entity.id
			: "Resolved entity " + result.entity.id,
		{ ...result.entity, created: result.created },
		"knowledge://entities/" + result.entity.id,
	);
}
/** Handle "merge_entities" tool. */
export async function handleMergeEntities(args, deps) {
	await deps.checkPolicy("merge_entities", { keepId: args.keep_id, mergeId: args.merge_id });
	const result = await deps.mergeEntities(args.keep_id, args.merge_id);
	deps.notifyResourceChange("entity");
	deps.logEvent("mutation", {
		op: "merge_entities",
		keep_id: args.keep_id,
		merge_id: args.merge_id,
		merged_count: result.merged_count,
		ok: true,
	});
	return deps.formatResult(
		"Merged entity " +
			args.merge_id +
			" into " +
			args.keep_id +
			" (" +
			result.merged_count +
			" triples reassigned)",
		{ keep_id: args.keep_id, merge_id: args.merge_id, ...result },
		"knowledge://entities/" + args.keep_id,
	);
}
/** Handle "query_entities" tool. */
export async function handleQueryEntities(args, deps) {
	const cursorError = deps.cursor.ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	const result = await deps.queryEntities(args);
	return deps.formatResult(
		result.items.length > 0
			? "Found " + result.items.length + " entities"
			: "No entities found",
		{ items: result.items, next_cursor: result.next_cursor },
		"knowledge://entities",
	);
}
/** Handle "extract_lessons" tool. */
export async function handleExtractLessons(args, deps) {
	const limit =
		typeof args.limit === "number" && deps.std.Number.isInteger(args.limit) && args.limit > 0
			? args.limit
			: 20;
	const hypotheses = await deps.listRefutedHypotheses(limit);
	let created = 0;
	let skipped = 0;
	for (let i = 0; i < hypotheses.length; i++) {
		const h = hypotheses[i];
		const hypothesisId = typeof h.id === "string" ? h.id : "";
		if (hypothesisId.length === 0) {
			continue;
		}
		if (await deps.hasLessonForHypothesis(hypothesisId)) {
			skipped += 1;
			continue;
		}
		const hypothesisTopic =
			typeof h.topic === "string" && h.topic.trim().length > 0
				? h.topic.trim()
				: "hypothesis";
		const hypothesisContent = typeof h.content === "string" ? h.content.trim() : "";
		const lesson = await deps.createEntry({
			topic: "Lesson: " + hypothesisTopic,
			content:
				"Refuted hypothesis: " +
				(hypothesisContent.length > 0 ? hypothesisContent : "[no content]"),
			knowledge_type: "lesson",
			memory_type: "factual",
			source: "system:lesson-extraction",
			actor: "system:lesson-extractor",
			confidence: 1,
		});
		await deps.createTriple({
			subject: lesson.id,
			predicate: "derived_from",
			object: hypothesisId,
			source: "system:lesson-extraction",
			actor: "system:lesson-extractor",
			confidence: 1,
		});
		created += 1;
	}
	if (created > 0) {
		deps.notifyResourceChange("entry");
		deps.notifyResourceChange("triple");
	}
	deps.logEvent("mutation", {
		op: "extract_lessons",
		created,
		skipped,
		scanned: hypotheses.length,
		ok: true,
	});
	return deps.formatResult(
		"Extracted " + created + " lessons (" + skipped + " skipped)",
		{ created, skipped, scanned: hypotheses.length },
		"knowledge://entries",
	);
}
