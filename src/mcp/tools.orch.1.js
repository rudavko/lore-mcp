/** @implements FR-015, FR-019, FR-020, NFR-001 — Orchestration-backed v0 MCP tool registration and handlers. */
import { normalizeValidToState } from "../lib/validity.pure.js";
import { buildValidationError } from "./tools-core.pure.js";
import { handleAutoUpdatesStatus, handleEnableAutoUpdates } from "./tools-system.efct.js";
import { buildToolSchemas } from "./tools-schemas.pure.js";
import { ensureValidCursor } from "./tools-cursor.pure.js";
import { normalizeMutationEntry, normalizeQueryEntry } from "./tools-entry-public.pure.js";
import { normalizeTriple } from "./tools-graph-public.pure.js";

function normalizeEntity(entity) {
	const validToState = normalizeValidToState(entity.valid_to_state, entity.valid_to ?? null);
	const aliases = Array.isArray(entity.aliases) ? entity.aliases : null;
	const aliasCount = aliases === null ? undefined : entity.alias_count ?? aliases.length;
	return {
		id: entity.id,
		name: entity.name,
		entity_type: entity.entity_type ?? null,
		source: entity.source ?? null,
		confidence: entity.confidence ?? null,
		tags: Array.isArray(entity.tags) ? entity.tags : [],
		produced_by: entity.produced_by ?? null,
		about: entity.about ?? null,
		affects: entity.affects ?? null,
		specificity: entity.specificity ?? null,
		created_at: entity.created_at,
		updated_at: entity.updated_at ?? entity.created_at,
		...(typeof entity.valid_from === "string" ? { valid_from: entity.valid_from } : {}),
		...(typeof entity.valid_to === "string" ? { valid_to: entity.valid_to } : {}),
		...(validToState !== "unspecified" ? { valid_to_state: validToState } : {}),
		...(aliases === null ? {} : { aliases, alias_count: aliasCount }),
	};
}

function normalizeNoteResult(entry) {
	const normalized = normalizeQueryEntry(entry, normalizeValidToState);
	return {
		kind: "note",
		id: normalized.id,
		topic: normalized.topic,
		body: normalized.content,
		tags: normalized.tags ?? [],
		source: normalized.source ?? null,
		confidence: normalized.confidence ?? null,
		embedding_status: normalized.embedding_status,
		score_lexical: normalized.score_lexical,
		score_semantic: normalized.score_semantic,
		score_graph: normalized.score_graph,
		score_total: normalized.score_total,
		graph_hops: normalized.graph_hops,
		canonical_entity_id: normalized.canonical_entity_id ?? null,
		valid_from: typeof entry.valid_from === "string" ? entry.valid_from : undefined,
		valid_to: typeof entry.valid_to === "string" ? entry.valid_to : undefined,
		created_at: normalized.created_at,
		updated_at: normalized.updated_at,
	};
}

function normalizeLinkResult(triple, created) {
	const normalized = normalizeTriple(triple, normalizeValidToState);
	return created === undefined ? { kind: "link", ...normalized } : { kind: "link", ...normalized, created };
}

function deriveNoteTopic(body) {
	const trimmed = typeof body === "string" ? body.trim() : "";
	if (trimmed.length === 0) {
		return "";
	}
	const firstLine = trimmed.split(/\r?\n/u, 1)[0].trim();
	if (firstLine.length === 0) {
		return trimmed.slice(0, 120);
	}
	return firstLine.length > 120 ? firstLine.slice(0, 120) : firstLine;
}

function toStringList(value) {
	if (typeof value === "string" && value.length > 0) {
		return [value];
	}
	if (!Array.isArray(value)) {
		return [];
	}
	const out = [];
	for (let i = 0; i < value.length; i++) {
		if (typeof value[i] === "string" && value[i].length > 0) {
			out.push(value[i]);
		}
	}
	return out;
}

function mergeTags(tags, specificity) {
	const base = Array.isArray(tags) ? tags : [];
	if (typeof specificity !== "string" || specificity.length === 0) {
		return [...base];
	}
	const marker = "specificity:" + specificity;
	return base.includes(marker) ? [...base] : [...base, marker];
}

function parseAsOfTimestamp(asOf, std) {
	if (typeof asOf !== "string" || asOf.length === 0) {
		return { error: null, value: null };
	}
	const ms = std.Date.parse(asOf);
	if (!std.Number.isFinite(ms)) {
		return { error: buildValidationError("Invalid as_of (must be ISO-8601)"), value: null };
	}
	return { error: null, value: ms };
}

function isRecordActiveAt(record, asOfMs, std) {
	if (asOfMs === null) {
		return true;
	}
	const validFromMs =
		typeof record.valid_from === "string" ? std.Date.parse(record.valid_from) : null;
	if (validFromMs !== null && std.Number.isFinite(validFromMs) && validFromMs > asOfMs) {
		return false;
	}
	const validToMs = typeof record.valid_to === "string" ? std.Date.parse(record.valid_to) : null;
	if (validToMs !== null && std.Number.isFinite(validToMs) && validToMs < asOfMs) {
		return false;
	}
	return true;
}

function entityScore(query, entity) {
	const queryLower = query.toLowerCase();
	const nameLower = typeof entity.name === "string" ? entity.name.toLowerCase() : "";
	if (nameLower.length > 0) {
		if (nameLower === queryLower) {
			return 0.95;
		}
		if (nameLower.includes(queryLower)) {
			return 0.85;
		}
	}
	const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
	for (let i = 0; i < aliases.length; i++) {
		const aliasLower = aliases[i].toLowerCase();
		if (aliasLower === queryLower) {
			return 0.8;
		}
		if (aliasLower.includes(queryLower)) {
			return 0.7;
		}
	}
	return 0.5;
}

function linkScore(query, triple) {
	const queryLower = query.toLowerCase();
	const fields = [triple.subject, triple.predicate, triple.object];
	let score = 0;
	for (let i = 0; i < fields.length; i++) {
		const valueLower = fields[i].toLowerCase();
		if (valueLower === queryLower) {
			score = score + 0.35;
		} else if (valueLower.includes(queryLower)) {
			score = score + 0.2;
		}
	}
	return score > 0 ? score : 0.3;
}

function encodeCompositeCursor(item, std) {
	return std.btoa(item.kind + ":" + item.id);
}

function decodeCompositeCursor(raw, std) {
	if (typeof raw !== "string" || raw.length === 0) {
		return null;
	}
	try {
		const decoded = std.atob(raw);
		return decoded.length > 0 ? decoded : null;
	} catch {
		return null;
	}
}

function dedupeById(items) {
	const seen = {};
	const out = [];
	for (let i = 0; i < items.length; i++) {
		const key = items[i].kind + ":" + items[i].id;
		if (seen[key] === true) {
			continue;
		}
		seen[key] = true;
		out.push(items[i]);
	}
	return out;
}

function compareRetrieveItems(left, right) {
	if (right.score_total !== left.score_total) {
		return right.score_total - left.score_total;
	}
	const leftKey = left.kind + ":" + left.id;
	const rightKey = right.kind + ":" + right.id;
	if (leftKey < rightKey) {
		return -1;
	}
	if (leftKey > rightKey) {
		return 1;
	}
	return 0;
}

function isPatternTooComplexError(error) {
	const message = String(error);
	return (
		message.indexOf("LIKE or GLOB pattern too complex") > -1 ||
		message.indexOf("pattern-too-complex") > -1
	);
}

async function swallowAuxiliaryQueryFailure(queryFn) {
	try {
		return await queryFn();
	} catch (error) {
		if (isPatternTooComplexError(error)) {
			return { items: [], next_cursor: null };
		}
		throw error;
	}
}

function buildEngineHelpPayload() {
	return {
		action: "help",
		tools: ["link_object", "object_create", "retrieve", "engine_check"],
		tool_contracts: {
			link_object: {
				description: "Create or update a link between two stored objects",
				parameters: {
					subject: {
						required: true,
						type: "string",
						description: "Subject identifier",
					},
					predicate: {
						required: true,
						type: "string",
						description: "Predicate / relationship label",
					},
					object: {
						required: true,
						type: "string",
						description: "Object identifier",
					},
					valid_from: {
						required: false,
						type: "string",
						description: "Optional start of validity interval (ISO-8601)",
					},
					valid_to: {
						required: false,
						type: "string",
						description:
							"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
					},
					confidence: {
						required: false,
						type: "number",
						description: "Confidence score 0-1",
					},
					source: {
						required: false,
						type: "string",
						description: "Provenance source identifier",
					},
				},
				example: {
					subject: "entity-alice",
					predicate: "supersedes",
					object: "entity-alice-v1",
					source: "audit-run",
					confidence: 0.9,
				},
			},
			object_create: {
				description: "Create a note or entity with optional related links",
				parameters: {
					kind: {
						required: true,
						type: "enum(note|entity)",
						description: "Object kind",
					},
					payload: {
						required: true,
						type: "object",
						description: "Required note body or entity name payload",
					},
					entity_type: {
						required: false,
						type: "string",
						description: "Optional entity classification label",
					},
					links: {
						required: false,
						type: "array",
						description: "Optional links created alongside the object",
					},
					source: {
						required: false,
						type: "string",
						description: "Provenance source identifier",
					},
					confidence: {
						required: false,
						type: "number",
						description: "Confidence score 0-1",
					},
					valid_from: {
						required: false,
						type: "string",
						description: "Optional start of validity interval (ISO-8601)",
					},
					valid_to: {
						required: false,
						type: "string",
						description:
							"Optional end of validity interval (ISO-8601); use 'infinite' for explicitly open-ended validity",
					},
					tags: {
						required: false,
						type: "string[]",
						description: "Tags for filtering and lightweight classification",
					},
					produced_by: {
						required: false,
						type: "string",
						description: "Optional producer identifier",
					},
					about: {
						required: false,
						type: "string",
						description: "Optional primary target or subject reference",
					},
					affects: {
						required: false,
						type: "string",
						description: "Optional affected target reference",
					},
					specificity: {
						required: false,
						type: "string",
						description: "Optional specificity label",
					},
				},
				example: {
					kind: "note",
					payload: { body: "Alice now owns the release checklist." },
					source: "meeting-notes",
					confidence: 0.8,
				},
			},
			retrieve: {
				description: "Search across notes, entities, and links",
				parameters: {
					query: {
						required: true,
						type: "string",
						description: "Query text",
					},
					limit: {
						required: false,
						type: "integer",
						description: "Max results to return (default: 20)",
					},
					as_of: {
						required: false,
						type: "string",
						description: "Return items valid at this timestamp (ISO-8601)",
					},
					include_links: {
						required: false,
						type: "boolean",
						description: "Include explicit links related to returned items",
					},
					include_auto_links: {
						required: false,
						type: "boolean",
						description: "Include implicit auto-links related to returned items",
					},
					cursor: {
						required: false,
						type: "string",
						description: "Pagination cursor from previous response",
					},
				},
				example: {
					query: "Alice release checklist",
					limit: 10,
					include_links: true,
				},
			},
			engine_check: {
				description: "Inspect help, status, history, or auto-update setup",
				parameters: {
					action: {
						required: true,
						type: "enum(help|status|history|auto_updates_status|enable_auto_updates)",
						description: "Check action",
					},
					target: {
						required: false,
						type: "string",
						description: "Optional target identifier",
					},
					limit: {
						required: false,
						type: "integer",
						description: "Max items to return for paginated actions",
					},
					cursor: {
						required: false,
						type: "string",
						description: "Pagination cursor from previous response",
					},
				},
				example: {
					action: "status",
				},
			},
		},
		actions: [
			{
				name: "help",
				description: "Return the machine-readable engine_check contract",
				required: [],
				optional: [],
				example: { action: "help" },
			},
			{
				name: "status",
				description: "Return instance status, build metadata, counts, and last write time",
				required: [],
				optional: [],
				example: { action: "status" },
			},
			{
				name: "history",
				description: "Return paginated transaction history",
				required: [],
				optional: ["limit", "cursor"],
				example: { action: "history", limit: 20 },
			},
			{
				name: "auto_updates_status",
				description: "Report current auto-update inspection limitations and install-flow behavior",
				required: [],
				optional: [],
				example: { action: "auto_updates_status" },
			},
			{
				name: "enable_auto_updates",
				description: "Generate a short-lived browser link for the admin install-workflow flow",
				required: [],
				optional: [],
				example: { action: "enable_auto_updates" },
			},
			{
				name: "delete",
				description: "Delete an entry or triple by ID through the public maintenance surface",
				required: ["id"],
				optional: ["entity_type"],
				example: { action: "delete", id: "entry-123", entity_type: "entry" },
			},
		],
		examples: {
			link_object: {
				subject: "entity-alice",
				predicate: "supersedes",
				object: "entity-alice-v1",
				source: "audit-run",
				confidence: 0.9,
			},
			object_create_note: {
				kind: "note",
				payload: { body: "Alice now owns the release checklist." },
				source: "meeting-notes",
				confidence: 0.8,
			},
			retrieve: {
				query: "Alice release checklist",
				limit: 10,
				include_links: true,
			},
			engine_check_status: { action: "status" },
			engine_check_auto_updates_status: { action: "auto_updates_status" },
			engine_check_enable_auto_updates: { action: "enable_auto_updates" },
			engine_check_delete: { action: "delete", id: "entry-123", entity_type: "entry" },
		},
		deprecations: {
			note: "Legacy mutation and lookup tool names are not part of the v0 public surface.",
			replaced_by: {
				store: "object_create",
				update: "object_create + link_object(predicate='supersedes')",
				delete: "link_object(... object='deleted')",
				query: "retrieve",
				query_graph: "retrieve + include_links",
				history: "engine_check(action='history')",
				auto_updates_status: "engine_check(action='auto_updates_status')",
				enable_auto_updates: "engine_check(action='enable_auto_updates')",
			},
		},
	};
}

function buildImplicitLinkSpecs(createdId, args) {
	const linkSpecs = [];
	const implicitLinkTargets = [
		["about", args.about],
		["affects", args.affects],
		["produced_by", args.produced_by],
	];
	for (let i = 0; i < implicitLinkTargets.length; i++) {
		const predicate = implicitLinkTargets[i][0];
		const targets = toStringList(implicitLinkTargets[i][1]);
		for (let j = 0; j < targets.length; j++) {
			linkSpecs.push({
				subject: createdId,
				predicate,
				object: targets[j],
				auto: true,
				source: args.source,
				confidence: args.confidence,
				valid_from: args.valid_from,
				valid_to: args.valid_to,
			});
		}
	}
	return linkSpecs;
}

function buildExplicitLinkSpecs(createdId, args) {
	if (!Array.isArray(args.links)) {
		return [];
	}
	const linkSpecs = [];
	for (let i = 0; i < args.links.length; i++) {
		const link = args.links[i];
		if (typeof link !== "object" || link === null) {
			continue;
		}
		linkSpecs.push({
			subject: typeof link.subject === "string" && link.subject.length > 0 ? link.subject : createdId,
			predicate: link.predicate,
			object: link.object,
			auto: false,
			source: link.source ?? args.source,
			confidence: link.confidence ?? args.confidence,
			valid_from: link.valid_from ?? args.valid_from,
			valid_to: link.valid_to ?? args.valid_to,
		});
	}
	return linkSpecs;
}

async function createRelatedLinks(createdId, args, deps) {
	const linkSpecs = [
		...buildImplicitLinkSpecs(createdId, args),
		...buildExplicitLinkSpecs(createdId, args),
	];
	const createdLinks = [];
	for (let i = 0; i < linkSpecs.length; i++) {
		const linkSpec = linkSpecs[i];
		if (typeof linkSpec.predicate !== "string" || typeof linkSpec.object !== "string") {
			throw buildValidationError("Object links require predicate and object");
		}
		if (typeof deps.validatePromotionRelation === "function") {
			await deps.validatePromotionRelation({
				subject: linkSpec.subject,
				predicate: linkSpec.predicate,
				object: linkSpec.object,
			});
		}
		await deps.checkPolicy("relate", linkSpec);
		const result = await deps.upsertTriple({
			...linkSpec,
			predicate_multi: deps.isPredicateMulti(linkSpec.predicate),
		});
		createdLinks.push(
			linkSpec.auto === true
				? { ...normalizeLinkResult(result.triple, result.created), auto: true }
				: normalizeLinkResult(result.triple, result.created),
		);
	}
	if (createdLinks.length > 0) {
		deps.notifyResourceChange("triple");
	}
	return createdLinks;
}

async function loadRelatedLinks(item, deps) {
	const values = item.kind === "entity" && typeof item.name === "string" ? [item.id, item.name] : [item.id];
	const seen = {};
	const links = [];
	for (let i = 0; i < values.length; i++) {
		const subjectResults = await deps.queryTriples({ subject: values[i], limit: 20 });
		const objectResults = await deps.queryTriples({ object: values[i], limit: 20 });
		const batches = [subjectResults.items || [], objectResults.items || []];
		for (let b = 0; b < batches.length; b++) {
			for (let j = 0; j < batches[b].length; j++) {
				const triple = batches[b][j];
				if (seen[triple.id] === true) {
					continue;
				}
				seen[triple.id] = true;
				links.push(normalizeLinkResult(triple));
			}
		}
	}
	return links;
}

function buildAutoLinks(item) {
	if (item.kind !== "note" || typeof item.canonical_entity_id !== "string" || item.canonical_entity_id.length === 0) {
		return [];
	}
	return [{
		kind: "link",
		subject: item.id,
		predicate: "about",
		object: item.canonical_entity_id,
		auto: true,
	}];
}

async function handleLinkObject(args, deps) {
	await deps.checkPolicy("relate", args);
	if (typeof deps.validatePromotionRelation === "function") {
		await deps.validatePromotionRelation({
			subject: args.subject,
			predicate: args.predicate,
			object: args.object,
		});
	}
	const result = await deps.upsertTriple({
		...args,
		predicate_multi: deps.isPredicateMulti(args.predicate),
	});
	deps.notifyResourceChange("triple");
	return deps.formatResult(
		result.created ? "Linked object " + result.triple.id : "Updated link " + result.triple.id,
		normalizeLinkResult(result.triple, result.created),
		"knowledge://graph/triples/" + result.triple.id,
	);
}

function buildNoteArgs(args) {
	const body = typeof args.payload.body === "string" ? args.payload.body : "";
	const explicitName = typeof args.payload.name === "string" ? args.payload.name.trim() : "";
	if (body.trim().length === 0) {
		throw buildValidationError("payload.body is required for kind='note'");
	}
	return {
		body,
		entryArgs: {
			topic: explicitName.length > 0 ? explicitName : deriveNoteTopic(body),
			content: body,
			allow_auto_entity_create: false,
			tags: mergeTags(args.tags, args.specificity),
			source: args.source,
			confidence: args.confidence,
			valid_from: args.valid_from,
			valid_to: args.valid_to,
		},
	};
}

function buildEntityArgs(args) {
	const rawName = typeof args.payload.name === "string" ? args.payload.name : "";
	const name = rawName.trim();
	if (name.length === 0) {
		throw buildValidationError("payload.name is required for kind='entity'");
	}
	return {
		name,
		entityArgs: {
			name,
			entity_type: args.entity_type,
			source: args.source,
			confidence: args.confidence,
			valid_from: args.valid_from,
			valid_to: args.valid_to,
			tags: Array.isArray(args.tags) ? args.tags : [],
			produced_by: typeof args.produced_by === "string" ? args.produced_by : null,
			about: typeof args.about === "string" ? args.about : null,
			affects: typeof args.affects === "string" ? args.affects : null,
			specificity: args.specificity,
		},
	};
}

async function handleObjectCreate(args, deps) {
	if (args.kind !== "note" && args.kind !== "entity") {
		throw buildValidationError("kind must be 'note' or 'entity'");
	}
	if (typeof args.payload !== "object" || args.payload === null) {
		throw buildValidationError("payload is required");
	}
	if (args.kind === "note") {
		const { entryArgs } = buildNoteArgs(args);
		await deps.checkPolicy("store", entryArgs);
		const entry = await deps.createAndEmbed(entryArgs);
		const normalizedEntry = normalizeMutationEntry(entry, normalizeValidToState).payload;
		const createdLinks = await createRelatedLinks(entry.id, args, deps);
		deps.notifyResourceChange("entry");
		return deps.formatResult(
			"Created note " + entry.id,
			{
				kind: "note",
				id: entry.id,
				topic: normalizedEntry.topic,
				body: normalizedEntry.content,
				tags: normalizedEntry.tags ?? [],
				source: normalizedEntry.source ?? null,
				confidence: normalizedEntry.confidence ?? null,
				embedding_status: normalizedEntry.embedding_status,
				canonical_entity_id: normalizedEntry.canonical_entity_id ?? null,
				created_at: normalizedEntry.created_at,
				updated_at: normalizedEntry.updated_at,
				links: createdLinks,
			},
			"knowledge://entries/" + entry.id,
		);
	}
	const { entityArgs } = buildEntityArgs(args);
	const result = await deps.upsertEntity(entityArgs);
	deps.notifyResourceChange("entity");
	const createdLinks = await createRelatedLinks(result.entity.id, args, deps);
	return deps.formatResult(
		result.created ? "Created entity " + result.entity.id : "Updated entity " + result.entity.id,
		{
			kind: "entity",
			...normalizeEntity(result.entity),
			created: result.created,
			updated: result.updated === true,
			links: createdLinks,
		},
		"knowledge://entities/" + result.entity.id,
	);
}

function mergeEntityResults(query, entityByName, entityByAlias, asOfMs, std) {
	const merged = dedupeById(
		(entityByName.items || [])
			.map((item) => ({ kind: "entity", ...normalizeEntity(item), score_total: entityScore(query, item) }))
			.concat(
				(entityByAlias.items || []).map((item) => ({
					kind: "entity",
					...normalizeEntity(item),
					score_total: entityScore(query, item),
				})),
			),
	);
	return merged.filter((item) => isRecordActiveAt(item, asOfMs, std));
}

function mergeLinkResults(query, linkBySubject, linkByPredicate, linkByObject, asOfMs, std) {
	const merged = dedupeById(
		(linkBySubject.items || [])
			.map((item) => ({ kind: "link", ...normalizeTriple(item, normalizeValidToState), score_total: linkScore(query, item) }))
			.concat(
				(linkByPredicate.items || []).map((item) => ({
					kind: "link",
					...normalizeTriple(item, normalizeValidToState),
					score_total: linkScore(query, item),
				})),
			)
			.concat(
				(linkByObject.items || []).map((item) => ({
					kind: "link",
					...normalizeTriple(item, normalizeValidToState),
					score_total: linkScore(query, item),
				})),
			),
	);
	return merged.filter((item) => isRecordActiveAt(item, asOfMs, std));
}

async function enrichRetrievePage(page, args, deps) {
	if (args.include_links !== true && args.include_auto_links !== true) {
		return page;
	}
	const out = [];
	for (let i = 0; i < page.length; i++) {
		const item = page[i];
		const enriched = {
			...item,
			...(args.include_links === true && item.kind !== "link" ? { links: await loadRelatedLinks(item, deps) } : {}),
			...(args.include_auto_links === true ? { auto_links: buildAutoLinks(item) } : {}),
		};
		out.push(enriched);
	}
	return out;
}

function filterPendingNormalizedNotes(items) {
	const pending = [];
	for (let i = 0; i < items.length; i++) {
		const normalized = normalizeNoteResult(items[i]);
		if (normalized.embedding_status === "pending") {
			pending.push(normalized);
		}
	}
	return pending;
}

function hasAllTags(item, tags) {
	if (!Array.isArray(tags) || tags.length === 0) {
		return true;
	}
	const itemTags = Array.isArray(item.tags) ? item.tags : [];
	for (let i = 0; i < tags.length; i++) {
		if (!itemTags.includes(tags[i])) {
			return false;
		}
	}
	return true;
}

function isLikelySemanticQuery(query) {
	return /\s/u.test(query);
}

async function handleRetrieve(args, deps) {
	const cursorError = ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	if (typeof args.query !== "string" || args.query.trim().length === 0) {
		throw buildValidationError("query is required");
	}
	const asOf = parseAsOfTimestamp(args.as_of, deps.std);
	if (asOf.error !== null) {
		throw asOf.error;
	}
	const startMs = deps.std.Date.now();
	const query = args.query.trim();
	const limit = typeof args.limit === "number" ? args.limit : 20;
	const [noteResults, entityByName, entityByAlias, linkBySubject, linkByPredicate, linkByObject] =
		await Promise.all([
			deps.hybridSearch({ query, limit: limit * 2, cursor: undefined }),
			swallowAuxiliaryQueryFailure(() => deps.queryEntities({ name: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() => deps.queryEntities({ alias: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() => deps.queryTriples({ subject: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() => deps.queryTriples({ predicate: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() => deps.queryTriples({ object: query, limit: limit * 2 })),
		]);
	let notes = (noteResults.items || [])
		.map((item) => normalizeNoteResult(item))
		.filter((item) => isRecordActiveAt(item, asOf.value, deps.std));
	if (notes.length === 0 && isLikelySemanticQuery(query)) {
		const fallbackNoteResults = await deps.hybridSearch({
			query: "",
			limit: limit * 2,
			cursor: undefined,
		});
		notes = filterPendingNormalizedNotes(fallbackNoteResults.items || []).filter((item) =>
			isRecordActiveAt(item, asOf.value, deps.std),
		);
	}
	const merged = notes
		.concat(mergeEntityResults(query, entityByName, entityByAlias, asOf.value, deps.std))
		.concat(mergeLinkResults(query, linkBySubject, linkByPredicate, linkByObject, asOf.value, deps.std));
	merged.sort(compareRetrieveItems);
	const filtered = merged.filter((item) => hasAllTags(item, args.tags));
	const decodedCursor = decodeCompositeCursor(args.cursor, deps.std);
	const cursorIndex =
		decodedCursor === null
			? -1
			: filtered.findIndex((item) => item.kind + ":" + item.id === decodedCursor);
	if (decodedCursor !== null && cursorIndex < 0) {
		throw buildValidationError("Cursor not found in current result set");
	}
	const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
	const pageSlice = filtered.slice(startIndex, startIndex + limit + 1);
	const hasMore = pageSlice.length > limit;
	const page = await enrichRetrievePage(hasMore ? pageSlice.slice(0, limit) : pageSlice, args, deps);
	const nextCursor = hasMore && page.length > 0 ? encodeCompositeCursor(page[page.length - 1], deps.std) : null;
	return deps.formatResult(
		page.length > 0 ? "Retrieved " + page.length + " objects" : "No objects found",
		{
			query,
			items: page,
			next_cursor: nextCursor,
			retrieval_ms: deps.std.Date.now() - startMs,
		},
		"knowledge://entries",
	);
}

async function handleHistoryAction(args, deps) {
	const result = await deps.getHistory({
		limit: typeof args.limit === "number" ? args.limit : 20,
		cursor: args.cursor,
	});
	return deps.formatResult(
		result.items.length > 0 ? result.items.length + " history items" : "No history found",
		{ action: "history", items: result.items, next_cursor: result.next_cursor },
		"knowledge://history/transactions",
	);
}

async function handleStatusAction(deps) {
	const summaryRows = await deps.querySummaryCounts();
	const counts = summaryRows[0]?.results || [];
	const history = await deps.getHistory({ limit: 1 });
	const entries = counts.find((item) => item.t === "entries");
	const triples = counts.find((item) => item.t === "triples");
	const entities = counts.find((item) => item.t === "entities");
	const payload = {
		action: "status",
		version: deps.appVersion,
		build_hash: deps.buildHash,
		entries: Number(entries?.c) || 0,
		triples: Number(triples?.c) || 0,
		entities: Number(entities?.c) || 0,
		last_write_at: history.items && history.items[0] ? history.items[0].created_at : null,
	};
	return deps.formatResult(JSON.stringify(payload), payload, "knowledge://history/transactions");
}

async function handleEngineCheck(args, deps) {
	if (args.action === "help") {
		return deps.formatResult("Engine help", buildEngineHelpPayload());
	}
	if (args.action === "auto_updates_status") {
		return await handleAutoUpdatesStatus({}, {
			formatResult: deps.formatResult,
			readAutoUpdatesInstallState: deps.readAutoUpdatesInstallState,
			resolveAutoUpdatesInstallContext: deps.resolveAutoUpdatesInstallContext,
		});
	}
	if (args.action === "enable_auto_updates") {
		return await handleEnableAutoUpdates({}, {
			std: deps.std,
			issueAutoUpdatesSetupToken: deps.issueAutoUpdatesSetupToken,
			autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
			buildEnableAutoUpdatesPath: deps.buildEnableAutoUpdatesPath,
			buildEnableAutoUpdatesUrl: deps.buildEnableAutoUpdatesUrl,
			resolveAutoUpdatesInstallContext: deps.resolveAutoUpdatesInstallContext,
			resolveEnableAutoUpdatesBaseUrl: deps.resolveEnableAutoUpdatesBaseUrl,
			validation: {
				buildValidationError,
			},
			requestHeaders: deps.requestHeaders,
			logEvent: deps.logEvent,
			formatResult: deps.formatResult,
		});
	}
	if (args.action === "delete") {
		return await deps.efctDelete(
			{ id: args.id, entity_type: args.entity_type },
			{
				checkPolicy: deps.checkPolicy,
				deleteByType: async (type, id) => {
					if (type === "triple") {
						return await deps.deleteTriple(id);
					}
					return await deps.deleteEntry(id);
				},
				notifyResourceChange: deps.notifyResourceChange,
				logEvent: deps.logEvent,
				formatResult: deps.formatResult,
			},
		);
	}
	if (args.action === "history") {
		return await handleHistoryAction(args, deps);
	}
	return await handleStatusAction(deps);
}

export function registerTools(server, deps) {
	const schemas = buildToolSchemas(deps.z);
	server.tool("link_object", "Create or update a link between two stored objects", schemas.link_object, (args) =>
		handleLinkObject(args, {
			checkPolicy: deps.checkPolicy,
			upsertTriple: deps.upsertTriple,
			isPredicateMulti: typeof deps.isPredicateMulti === "function" ? deps.isPredicateMulti : () => false,
			validatePromotionRelation: deps.validatePromotionRelation,
			notifyResourceChange: deps.notifyResourceChange,
			formatResult: deps.formatResult,
		}),
	);
	server.tool("object_create", "Create a note or entity with optional related links", schemas.object_create, (args) =>
		handleObjectCreate(args, {
			checkPolicy: deps.checkPolicy,
			createAndEmbed: typeof deps.createAndEmbed === "function" ? deps.createAndEmbed : deps.createEntry,
			upsertEntity: deps.upsertEntity,
			upsertTriple: deps.upsertTriple,
			isPredicateMulti: typeof deps.isPredicateMulti === "function" ? deps.isPredicateMulti : () => false,
			validatePromotionRelation: deps.validatePromotionRelation,
			notifyResourceChange: deps.notifyResourceChange,
			formatResult: deps.formatResult,
		}),
	);
	server.tool("retrieve", "Search across notes, entities, and links", schemas.retrieve, (args) =>
		handleRetrieve(args, {
			std: deps.std,
			hybridSearch: deps.hybridSearch,
			queryEntities: deps.queryEntities,
			queryTriples: deps.queryTriples,
			formatResult: deps.formatResult,
		}),
	);
	server.tool("engine_check", "Inspect help, status, history, or auto-update setup", schemas.engine_check, (args, extra) =>
		handleEngineCheck(args, {
			appVersion: typeof deps.appVersion === "string" ? deps.appVersion : "unknown",
			autoUpdatesLinkTtlSeconds: deps.autoUpdatesLinkTtlSeconds,
			buildEnableAutoUpdatesPath: deps.buildEnableAutoUpdatesPath,
			buildEnableAutoUpdatesUrl: deps.buildEnableAutoUpdatesUrl,
			buildHash: typeof deps.buildHash === "string" ? deps.buildHash : "unknown",
			formatError: deps.formatError,
			formatResult: deps.formatResult,
			getHistory: deps.getHistory,
			issueAutoUpdatesSetupToken: deps.issueAutoUpdatesSetupToken,
			logEvent: deps.logEvent,
			readAutoUpdatesInstallState: deps.readAutoUpdatesInstallState,
			efctDelete: deps.efctDelete,
			querySummaryCounts: deps.querySummaryCounts,
			requestHeaders:
				typeof extra === "object" &&
				extra !== null &&
				typeof extra.requestInfo === "object" &&
				extra.requestInfo !== null &&
				typeof extra.requestInfo.headers === "object" &&
				extra.requestInfo.headers !== null
					? extra.requestInfo.headers
					: undefined,
			resolveEnableAutoUpdatesBaseUrl: deps.resolveEnableAutoUpdatesBaseUrl,
			resolveAutoUpdatesInstallContext: deps.resolveAutoUpdatesInstallContext,
			std: deps.std,
			deleteEntry: deps.deleteEntry,
			deleteTriple: deps.deleteTriple,
			checkPolicy: deps.checkPolicy,
			notifyResourceChange: deps.notifyResourceChange,
		}),
	);
}
