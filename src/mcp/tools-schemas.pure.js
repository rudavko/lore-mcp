/** @implements FR-015, FR-019, FR-020, NFR-001 — Schema definitions for the v0 MCP tool surface. */

export const _MODULE = "tools-schemas.pure";

export function buildToolSchemas(z) {
	const text = (desc, opt) =>
		opt ? z.string().optional().describe(desc) : z.string().describe(desc);
	const confidence = (desc) => z.number().min(0).max(1).optional().describe(desc);
	const integer = (desc, min, max) => {
		let schema = z.number().int().min(min);
		if (max !== undefined) {
			schema = schema.max(max);
		}
		return schema.optional().describe(desc);
	};
	const bool = (desc) => z.boolean().optional().describe(desc);
	const stringArray = (desc) => z.array(z.string()).optional().describe(desc);
	const linkObject = z.object({
		subject: text("Subject identifier"),
		predicate: text("Predicate / relationship label"),
		object: text("Object identifier"),
		valid_from: text("Optional start of validity interval (ISO-8601)", true),
		valid_to: text(
			"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
			true,
		),
		confidence: confidence("Confidence score 0-1"),
		source: text("Provenance source identifier", true),
	});
	const payload = z.object({
		body: text("Required when kind='note': note body text", true),
		name: text("Required when kind='entity': canonical entity name", true),
	});
	return {
		link_object: linkObject.shape,
		object_create: {
			kind: z.enum(["note", "entity"]).describe("Object kind"),
			payload,
			entity_type: text("Optional entity classification label", true),
			links: z
				.array(
					z.object({
						subject: text("Optional explicit subject; defaults to the created object ID", true),
						predicate: text("Predicate / relationship label"),
						object: text("Object identifier"),
						valid_from: text("Optional start of validity interval (ISO-8601)", true),
						valid_to: text(
							"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
							true,
						),
						confidence: confidence("Confidence score 0-1"),
						source: text("Provenance source identifier", true),
					}),
				)
				.optional()
				.describe("Optional links created alongside the object"),
			source: text("Provenance source identifier", true),
			confidence: confidence("Confidence score 0-1"),
			valid_from: text("Optional start of validity interval (ISO-8601)", true),
			valid_to: text(
				"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
				true,
			),
			tags: stringArray("Tags for filtering and lightweight classification"),
			produced_by: text("Optional producer identifier", true),
			about: text("Optional primary target or subject reference", true),
			affects: text("Optional affected target reference", true),
			specificity: text("Optional specificity label", true),
		},
		retrieve: {
			query: text("Query text"),
			limit: integer("Max results to return (default: 20)", 1, 200),
			as_of: text("Return items valid at this timestamp (ISO-8601)", true),
			include_links: bool("Include explicit links related to returned items"),
			include_auto_links: bool("Include implicit auto-links related to returned items"),
			cursor: text("Pagination cursor from previous response", true),
		},
		engine_check: {
			action: z.enum(["help", "status", "history", "ingest_status"]).describe("Check action"),
			target: text("Optional target identifier", true),
			task_id: text("Optional ingestion task identifier", true),
			limit: integer("Max items to return for paginated actions", 1, 200),
			cursor: text("Pagination cursor from previous response", true),
		},
	};
}
