/** @implements FR-015, FR-019, FR-020, NFR-001 — Schema definitions for the v0 MCP tool surface. */


function describeSchema(schema, desc) {
	return schema.describe(desc);
}

function requiredText(z, desc) {
	return describeSchema(z.string(), desc);
}

function optionalText(z, desc) {
	return describeSchema(z.string().optional(), desc);
}

function optionalConfidence(z, desc) {
	let schema = z.number();
	schema = schema.min(0);
	schema = schema.max(1);
	return describeSchema(schema.optional(), desc);
}

function optionalInteger(z, desc, min, max) {
	let schema = z.number();
	schema = schema.int();
	schema = schema.min(min);
	if (max !== undefined) {
		schema = schema.max(max);
	}
	return describeSchema(schema.optional(), desc);
}

function optionalBoolean(z, desc) {
	return describeSchema(z.boolean().optional(), desc);
}

function optionalStringArray(z, desc) {
	const item = z.string();
	const array = z.array(item);
	return describeSchema(array.optional(), desc);
}

function buildLinkSchema(z) {
	return z.object({
		subject: requiredText(z, "Subject identifier"),
		predicate: requiredText(z, "Predicate / relationship label"),
		object: requiredText(z, "Object identifier"),
		valid_from: optionalText(z, "Optional start of validity interval (ISO-8601)"),
		valid_to: optionalText(
			z,
			"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
		),
		confidence: optionalConfidence(z, "Confidence score 0-1"),
		source: optionalText(z, "Provenance source identifier"),
	});
}

function buildPayloadSchema(z) {
	return z.object({
		body: optionalText(z, "Required when kind='note': note body text"),
		name: optionalText(z, "Required when kind='entity': canonical entity name"),
	});
}

function buildObjectLinkSchema(z) {
	return z.object({
		subject: optionalText(z, "Optional explicit subject; defaults to the created object ID"),
		predicate: requiredText(z, "Predicate / relationship label"),
		object: requiredText(z, "Object identifier"),
		valid_from: optionalText(z, "Optional start of validity interval (ISO-8601)"),
		valid_to: optionalText(
			z,
			"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
		),
		confidence: optionalConfidence(z, "Confidence score 0-1"),
		source: optionalText(z, "Provenance source identifier"),
	});
}

function buildObjectCreateSchema(z, payload) {
	const linkSchema = buildObjectLinkSchema(z);
	const links = z.array(linkSchema).optional().describe("Optional links created alongside the object");
	return {
		kind: z.enum(["note", "entity"]).describe("Object kind"),
		payload,
		entity_type: optionalText(z, "Optional entity classification label"),
		links,
		source: optionalText(z, "Provenance source identifier"),
		confidence: optionalConfidence(z, "Confidence score 0-1"),
		valid_from: optionalText(z, "Optional start of validity interval (ISO-8601)"),
		valid_to: optionalText(
			z,
			"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
		),
		tags: optionalStringArray(z, "Tags for filtering and lightweight classification"),
		produced_by: optionalText(z, "Optional producer identifier"),
		about: optionalText(z, "Optional primary target or subject reference"),
		affects: optionalText(z, "Optional affected target reference"),
		specificity: optionalText(z, "Optional specificity label"),
	};
}

function buildRetrieveSchema(z) {
	return {
		query: requiredText(z, "Query text"),
		limit: optionalInteger(z, "Max results to return (default: 20)", 1, 200),
		as_of: optionalText(z, "Return items valid at this timestamp (ISO-8601)"),
		tags: optionalStringArray(z, "Only return items whose tags contain all specified tags"),
		include_links: optionalBoolean(z, "Include explicit links related to returned items"),
		include_auto_links: optionalBoolean(z, "Include implicit auto-links related to returned items"),
		cursor: optionalText(z, "Pagination cursor from previous response"),
	};
}

function buildEngineCheckSchema(z) {
	return {
		action: z
			.enum(["help", "status", "history", "auto_updates_status", "enable_auto_updates", "delete"])
			.describe("Check action"),
		id: optionalText(z, "Entity identifier for delete actions"),
		entity_type: describeSchema(
			z.enum(["entry", "triple"]).optional(),
			"Entity type for delete actions (defaults to 'entry')",
		),
		target: optionalText(z, "Optional target identifier"),
		limit: optionalInteger(z, "Max items to return for paginated actions", 1, 200),
		cursor: optionalText(z, "Pagination cursor from previous response"),
	};
}

export function buildToolSchemas(z) {
	const linkObject = buildLinkSchema(z);
	const payload = buildPayloadSchema(z);
	return {
		link_object: linkObject.shape,
		object_create: buildObjectCreateSchema(z, payload),
		retrieve: buildRetrieveSchema(z),
		engine_check: buildEngineCheckSchema(z),
	};
}
