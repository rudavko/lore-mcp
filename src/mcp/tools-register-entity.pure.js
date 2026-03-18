/** @implements FR-012, FR-013, FR-014 — Register entity and lesson-extraction MCP tools. */
import { ensureValidCursor } from "./tools-cursor.pure.js";

export const _MODULE = "tools-register-entity.pure";
/** Register entity-focused tools. */
export function registerEntityTools(server, schemas, deps) {
	const tool = (name, description, schema, handler) => {
		server.tool(name, description, schema, handler);
	};
	tool(
		"upsert_entity",
		"Create or resolve a canonical entity by name",
		schemas.upsert_entity,
		(args) =>
			deps.efctUpsertEntity(args, {
				upsertEntity: deps.upsertEntity,
				notifyResourceChange: deps.notifyResourceChange,
				formatResult: deps.formatResult,
			}),
	);
	tool("set_type", "Set entry knowledge_type and/or memory_type", schemas.set_type, (args) =>
		deps.efctSetType(args, {
			setEntryTypes: deps.setEntryTypes,
			notifyResourceChange: deps.notifyResourceChange,
			formatResult: deps.formatResult,
		}),
	);
	tool(
		"merge_entities",
		"Merge two canonical entities (keep one, absorb the other)",
		schemas.merge_entities,
		(args) =>
			deps.efctMergeEntities(args, {
				checkPolicy: deps.checkPolicy,
				mergeEntities: deps.mergeEntities,
				notifyResourceChange: deps.notifyResourceChange,
				logEvent: deps.logEvent,
				formatResult: deps.formatResult,
			}),
	);
	tool(
			"query_entities",
			"Query canonical entities and aliases",
			schemas.query_entities,
			(args) =>
				deps.efctQueryEntities(args, {
					cursor: {
						ensureValidCursor,
					},
					std: deps.std,
					queryEntities: deps.queryEntities,
					formatResult: deps.formatResult,
			}),
	);
	tool(
		"extract_lessons",
		"Create lesson entries from refuted hypotheses",
		schemas.extract_lessons,
		(args) =>
			deps.efctExtractLessons(args, {
				std: deps.std,
				listRefutedHypotheses: deps.listRefutedHypotheses,
				hasLessonForHypothesis: deps.hasLessonForHypothesis,
				createEntry: deps.createEntry,
				createTriple: deps.createTriple,
				notifyResourceChange: deps.notifyResourceChange,
				logEvent: deps.logEvent,
				formatResult: deps.formatResult,
			}),
	);
}
