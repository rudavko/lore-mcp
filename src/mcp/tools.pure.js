/** @implements FR-015, FR-019, FR-020, NFR-001 — v0 MCP tool registration for link creation, object creation, unified retrieval, and engine checks. */
import { isInfiniteValidTo, normalizeValidToState } from "../lib/validity.pure.js";
import {
	buildQueryText as buildQueryTextCore,
	filterByTags as filterByTagsCore,
	handleBuildInfo as handleBuildInfoCore,
	handleTime as handleTimeCore,
	buildValidationError,
} from "./tools-core.pure.js";
import { buildToolSchemas } from "./tools-schemas.pure.js";
import { ensureValidCursor } from "./tools-cursor.pure.js";
import { normalizeMutationEntry, normalizeQueryEntry } from "./tools-entry-public.pure.js";
import { normalizeTriple } from "./tools-graph-public.pure.js";

export const _MODULE = "tools.pure";

export function handleTime(args, deps) {
	return handleTimeCore(args, deps);
}
export function handleBuildInfo(args, deps) {
	return handleBuildInfoCore(args, deps);
}
export function filterByTags(items, tags) {
	return filterByTagsCore(items, tags);
}
export function buildQueryText(args) {
	return buildQueryTextCore(args);
}

function normalizeEntity(entity) {
	const validToState = normalizeValidToState(entity.valid_to_state, entity.valid_to ?? null);
	const out = {
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
	};
	if (typeof entity.valid_from === "string") {
		out.valid_from = entity.valid_from;
	}
	if (typeof entity.valid_to === "string") {
		out.valid_to = entity.valid_to;
	}
	if (validToState !== "unspecified") {
		out.valid_to_state = validToState;
	}
	if (Array.isArray(entity.aliases)) {
		out.aliases = entity.aliases;
		out.alias_count = entity.alias_count ?? entity.aliases.length;
	}
	return out;
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
		created_at: normalized.created_at,
		updated_at: normalized.updated_at,
	};
}

function normalizeLinkResult(triple, created) {
	const normalized = normalizeTriple(triple, normalizeValidToState);
	const out = { kind: "link", ...normalized };
	if (created !== undefined) {
		out.created = created;
	}
	return out;
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
	const out = Array.isArray(tags) ? [...tags] : [];
	if (typeof specificity === "string" && specificity.length > 0) {
		const marker = "specificity:" + specificity;
		if (!out.includes(marker)) {
			out.push(marker);
		}
	}
	return out;
}

function parseAsOfTimestamp(asOf, std) {
	if (typeof asOf !== "string" || asOf.length === 0) {
		return null;
	}
	const ms = std.Date.parse(asOf);
	if (!std.Number.isFinite(ms)) {
		throw buildValidationError("Invalid as_of (must be ISO-8601)");
	}
	return ms;
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
	const nameLower = entity.name.toLowerCase();
	if (nameLower === queryLower) {
		return 0.95;
	}
	if (nameLower.includes(queryLower)) {
		return 0.85;
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
				name: "ingest_status",
				description: "Return the state of an async ingestion task",
				required: ["task_id"],
				optional: [],
				example: { action: "ingest_status", task_id: "ingestion-task-id" },
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
			engine_check_status: {
				action: "status",
			},
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
				ingestion_status: "engine_check(action='ingest_status')",
			},
		},
	};
}

async function createRelatedLinks(createdId, args, deps) {
	const linkSpecs = [];
	const implicitLinkTargets = [
		["about", args.about],
		["affects", args.affects],
		["produced_by", args.produced_by],
	];
	for (let i = 0; i < implicitLinkTargets.length; i++) {
		const targets = toStringList(implicitLinkTargets[i][1]);
		for (let j = 0; j < targets.length; j++) {
			linkSpecs.push({
				subject: createdId,
				predicate: implicitLinkTargets[i][0],
				object: targets[j],
				source: args.source,
				confidence: args.confidence,
				valid_from: args.valid_from,
				valid_to: args.valid_to,
			});
		}
	}
	if (Array.isArray(args.links)) {
		for (let i = 0; i < args.links.length; i++) {
			const link = args.links[i];
			if (typeof link !== "object" || link === null) {
				continue;
			}
			linkSpecs.push({
				subject: typeof link.subject === "string" && link.subject.length > 0 ? link.subject : createdId,
				predicate: link.predicate,
				object: link.object,
				source: link.source ?? args.source,
				confidence: link.confidence ?? args.confidence,
				valid_from: link.valid_from ?? args.valid_from,
				valid_to: link.valid_to ?? args.valid_to,
			});
		}
	}
	const createdLinks = [];
	for (let i = 0; i < linkSpecs.length; i++) {
		if (typeof linkSpecs[i].predicate !== "string" || typeof linkSpecs[i].object !== "string") {
			throw buildValidationError("Object links require predicate and object");
		}
		if (typeof deps.validatePromotionRelation === "function") {
			await deps.validatePromotionRelation({
				subject: linkSpecs[i].subject,
				predicate: linkSpecs[i].predicate,
				object: linkSpecs[i].object,
			});
		}
		await deps.checkPolicy("relate", linkSpecs[i]);
		const result = await deps.upsertTriple({
			...linkSpecs[i],
			predicate_multi: deps.isPredicateMulti(linkSpecs[i].predicate),
		});
		createdLinks.push(normalizeLinkResult(result.triple, result.created));
	}
	if (createdLinks.length > 0) {
		deps.notifyResourceChange("triple");
	}
	return createdLinks;
}

async function loadRelatedLinks(item, deps) {
	const values = [item.id];
	if (item.kind === "entity" && typeof item.name === "string") {
		values.push(item.name);
	}
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
	const autoLinks = [];
	if (item.kind === "note" && typeof item.canonical_entity_id === "string" && item.canonical_entity_id.length > 0) {
		autoLinks.push({
			kind: "link",
			subject: item.id,
			predicate: "about",
			object: item.canonical_entity_id,
			auto: true,
		});
	}
	return autoLinks;
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

async function handleObjectCreate(args, deps) {
	if (args.kind !== "note" && args.kind !== "entity") {
		throw buildValidationError("kind must be 'note' or 'entity'");
	}
	if (typeof args.payload !== "object" || args.payload === null) {
		throw buildValidationError("payload is required");
	}
	if (args.kind === "note") {
		const body = typeof args.payload.body === "string" ? args.payload.body : "";
		const topic = deriveNoteTopic(body);
		if (body.trim().length === 0) {
			throw buildValidationError("payload.body is required for kind='note'");
		}
		const entryArgs = {
			topic,
			content: body,
			tags: mergeTags(args.tags, args.specificity),
			source: args.source,
			confidence: args.confidence,
			valid_from: args.valid_from,
			valid_to: args.valid_to,
		};
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
	const name = typeof args.payload.name === "string" ? args.payload.name : "";
	if (name.trim().length === 0) {
		throw buildValidationError("payload.name is required for kind='entity'");
	}
	const result = await deps.upsertEntity({
		name: name.trim(),
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
	});
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

async function handleRetrieve(args, deps) {
	const cursorError = ensureValidCursor(args.cursor, deps.std);
	if (cursorError !== null) {
		throw cursorError;
	}
	if (typeof args.query !== "string" || args.query.trim().length === 0) {
		throw buildValidationError("query is required");
	}
	const startMs = deps.std.Date.now();
	const query = args.query.trim();
	const limit = typeof args.limit === "number" ? args.limit : 20;
	const asOfMs = parseAsOfTimestamp(args.as_of, deps.std);
	const [noteResults, entityByName, entityByAlias, linkBySubject, linkByPredicate, linkByObject] =
		await Promise.all([
			deps.hybridSearch({ query, limit: limit * 2, cursor: undefined }),
			swallowAuxiliaryQueryFailure(() => deps.queryEntities({ name: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() => deps.queryEntities({ alias: query, limit: limit * 2 })),
			swallowAuxiliaryQueryFailure(() =>
				deps.queryTriples({ subject: query, limit: limit * 2 }),
			),
			swallowAuxiliaryQueryFailure(() =>
				deps.queryTriples({ predicate: query, limit: limit * 2 }),
			),
			swallowAuxiliaryQueryFailure(() =>
				deps.queryTriples({ object: query, limit: limit * 2 }),
			),
		]);
	const merged = [];
	const notes = noteResults.items || [];
	for (let i = 0; i < notes.length; i++) {
		const normalized = normalizeNoteResult(notes[i]);
		if (!isRecordActiveAt(normalized, asOfMs, deps.std)) {
			continue;
		}
		merged.push(normalized);
	}
	const entities = dedupeById(
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
	for (let i = 0; i < entities.length; i++) {
		if (!isRecordActiveAt(entities[i], asOfMs, deps.std)) {
			continue;
		}
		merged.push(entities[i]);
	}
	const links = dedupeById(
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
	for (let i = 0; i < links.length; i++) {
		if (!isRecordActiveAt(links[i], asOfMs, deps.std)) {
			continue;
		}
		merged.push(links[i]);
	}
	merged.sort(compareRetrieveItems);
	const decodedCursor = decodeCompositeCursor(args.cursor, deps.std);
	let startIndex = 0;
	if (decodedCursor !== null) {
		const index = merged.findIndex((item) => item.kind + ":" + item.id === decodedCursor);
		startIndex = index >= 0 ? index + 1 : 0;
	}
	const pageSlice = merged.slice(startIndex, startIndex + limit + 1);
	const hasMore = pageSlice.length > limit;
	const page = hasMore ? pageSlice.slice(0, limit) : pageSlice;
	if (args.include_links === true || args.include_auto_links === true) {
		for (let i = 0; i < page.length; i++) {
			if (args.include_links === true && page[i].kind !== "link") {
				page[i].links = await loadRelatedLinks(page[i], deps);
			}
			if (args.include_auto_links === true) {
				page[i].auto_links = buildAutoLinks(page[i]);
			}
		}
	}
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

async function handleEngineCheck(args, deps) {
	if (args.action === "help") {
		return deps.formatResult("Engine help", buildEngineHelpPayload());
	}
	if (args.action === "history") {
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
	if (args.action === "ingest_status") {
		if (typeof args.task_id !== "string" || args.task_id.length === 0) {
			throw buildValidationError("task_id is required for ingest_status");
		}
		const status = await deps.getIngestionStatus(args.task_id);
		if (status === null) {
			return deps.formatError(deps.throwNotFound("Ingestion task", args.task_id));
		}
		return deps.formatResult(
			"Ingestion task " + args.task_id + ": " + status.status,
			{ action: "ingest_status", ...status },
			"knowledge://ingestion/" + args.task_id,
		);
	}
	const summaryRows = await deps.querySummaryCounts();
	const counts = summaryRows[0]?.results || [];
	const history = await deps.getHistory({ limit: 1 });
	const out = {
		action: "status",
		version: deps.appVersion,
		build_hash: deps.buildHash,
		entries: 0,
		triples: 0,
		entities: 0,
		last_write_at: history.items && history.items[0] ? history.items[0].created_at : null,
	};
	for (let i = 0; i < counts.length; i++) {
		if (counts[i].t === "entries") {
			out.entries = Number(counts[i].c) || 0;
		}
		if (counts[i].t === "triples") {
			out.triples = Number(counts[i].c) || 0;
		}
		if (counts[i].t === "entities") {
			out.entities = Number(counts[i].c) || 0;
		}
	}
	return deps.formatResult("Engine status", out, "knowledge://history/transactions");
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
	server.tool("engine_check", "Inspect help, status, history, or ingestion progress", schemas.engine_check, (args) =>
		handleEngineCheck(args, {
			appVersion: typeof deps.appVersion === "string" ? deps.appVersion : "unknown",
			buildHash: typeof deps.buildHash === "string" ? deps.buildHash : "unknown",
			formatError: deps.formatError,
			formatResult: deps.formatResult,
			getHistory: deps.getHistory,
			getIngestionStatus: deps.getIngestionStatus,
			querySummaryCounts: deps.querySummaryCounts,
			throwNotFound: deps.throwNotFound,
		}),
	);
}
