/** @implements FR-003, NFR-001 — Pure entity mapping and merge snapshot helpers. */
import { deriveValidToStateFromInput, normalizeValidToState } from "../lib/validity.pure.js";
export function escapeEntityLike(value) {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseTags(raw, parseJson) {
	if (typeof raw !== "string" || raw.length === 0) {
		return [];
	}
	if (typeof parseJson !== "function") {
		return [];
	}
	try {
		const parsed = parseJson(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}
		const tags = [];
		for (let i = 0; i < parsed.length; i++) {
			if (typeof parsed[i] === "string") {
				tags.push(parsed[i]);
			}
		}
		return tags;
	} catch {
		return [];
	}
}

export function buildEntityQueryState(params, decodedCursor) {
	const conditions = ["1=1"];
	const binds = [];
	if (decodedCursor) {
		conditions.push("ce.id < ?");
		binds.push(decodedCursor);
	}
	if (params.name && params.name.length > 0) {
		conditions.push("ce.name LIKE ? ESCAPE '\\'");
		binds.push(`%${escapeEntityLike(params.name)}%`);
	}
	if (params.alias && params.alias.length > 0) {
		conditions.push(
			"EXISTS (SELECT 1 FROM entity_aliases ea WHERE ea.canonical_entity_id = ce.id AND ea.alias LIKE ? ESCAPE '\\')",
		);
		binds.push(`%${escapeEntityLike(params.alias.toLowerCase())}%`);
	}
	return { whereClause: conditions.join(" AND "), binds };
}

export function buildEntityQueryItems(pageRows, aliasRows, parseJson) {
	const aliasMap = {};
	for (let i = 0; i < aliasRows.length; i++) {
		const entityId = aliasRows[i].canonical_entity_id;
		const alias = aliasRows[i].alias;
		if (typeof entityId !== "string" || typeof alias !== "string") {
			continue;
		}
		const list = aliasMap[entityId];
		aliasMap[entityId] = list ? [...list, alias] : [alias];
	}
	const items = [];
	for (let i = 0; i < pageRows.length; i++) {
		const id = pageRows[i].id;
		const aliases = aliasMap[id] || [];
		items.push({
			...rowToEntity(pageRows[i], parseJson),
			aliases,
			alias_count: aliases.length,
		});
	}
	return items;
}

export function rowToEntity(r, parseJson) {
	const validTo = r.valid_to ?? null;
	return {
		id: r.id,
		name: r.name,
		entity_type: r.entity_type ?? null,
		source: r.source ?? null,
		confidence: r.confidence ?? null,
		valid_from: r.valid_from ?? null,
		valid_to: validTo,
		valid_to_state: normalizeValidToState(r.valid_to_state, validTo),
		tags: parseTags(r.tags, parseJson),
		produced_by: r.produced_by ?? null,
		about: r.about ?? null,
		affects: r.affects ?? null,
		specificity: r.specificity ?? null,
		created_at: r.created_at,
		updated_at: r.updated_at ?? r.created_at,
	};
}
export function rowToAlias(r) {
	return {
		id: r.id,
		alias: r.alias,
		canonical_entity_id: r.canonical_entity_id,
		created_at: r.created_at,
	};
}
export function buildEntityObject(id, input, now) {
	const params = typeof input === "string" ? { name: input } : input;
	const normalizedValidity = deriveValidToStateFromInput(params.valid_to ?? null);
	return {
		id,
		name: params.name,
		entity_type: params.entity_type ?? null,
		source: params.source ?? null,
		confidence: params.confidence ?? null,
		valid_from: params.valid_from ?? null,
		valid_to: normalizedValidity.validTo ?? null,
		valid_to_state: params.valid_to_state ?? normalizedValidity.validToState,
		tags: params.tags ?? [],
		produced_by: params.produced_by ?? null,
		about: params.about ?? null,
		affects: params.affects ?? null,
		specificity: params.specificity ?? null,
		created_at: now,
		updated_at: now,
	};
}
export function buildAliasObject(id, alias, entityId, now) {
	return {
		id,
		alias: alias.toLowerCase(),
		canonical_entity_id: entityId,
		created_at: now,
	};
}
/** Build the before-snapshot for merge undo. Caller serializes to JSON in efct layer. */
export function buildMergeSnapshot(input) {
	return {
		keep_id: input.keepId,
		keep_name: input.keepName,
		merge_id: input.mergeId,
		merge_name: input.mergeName,
		merge_created_at: input.mergeCreatedAt,
		subj_triple_ids: input.subjTripleIds,
		obj_triple_ids: input.objTripleIds,
		merge_entry_ids: input.mergeEntryIds,
		merge_alias_ids: input.mergeAliasIds,
	};
}
