/** @implements FR-001 — Entry auto-link resolution helpers shared by entry create/update orchestration. */
function resolvedCanonicalId(value) {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "object" && value !== null && typeof value.id === "string") {
		return value.id;
	}
	return null;
}
function isAutoCreatedCanonical(value) {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return value.auto_created === true || value.auto_link_entity_created === true;
}
function resolvedCanonicalName(value) {
	if (typeof value === "object" && value !== null && typeof value.name === "string") {
		return value.name;
	}
	return null;
}
function resolvedCanonicalEntityCreatedId(value) {
	if (
		typeof value === "object" &&
		value !== null &&
		typeof value.auto_link_entity_id === "string"
	) {
		return value.auto_link_entity_id;
	}
	return null;
}
function isAutoLinkedAliasCreated(value) {
	return typeof value === "object" && value !== null && value.auto_link_alias_created === true;
}
function resolvedCanonicalAlias(value) {
	if (typeof value === "object" && value !== null && typeof value.auto_link_alias === "string") {
		return value.auto_link_alias;
	}
	return null;
}
function resolvedCanonicalAliasId(value) {
	if (
		typeof value === "object" &&
		value !== null &&
		typeof value.auto_link_alias_id === "string"
	) {
		return value.auto_link_alias_id;
	}
	return null;
}
export function validateCreateEntryInput(params, deps, normalizedValidity) {
	const validation = deps.validateEntryFields({
		topic: params.topic,
		content: params.content,
		source: params.source ?? undefined,
		confidence: params.confidence ?? undefined,
		ttl_seconds: params.ttl_seconds ?? undefined,
		valid_from: params.valid_from ?? undefined,
		valid_to: normalizedValidity.validTo ?? undefined,
		knowledge_type: params.knowledge_type,
		memory_type: params.memory_type,
		status: params.status,
	});
	if (!validation.ok) {
		deps.throwValidation(validation.error.message);
	}
}
export async function resolveCreateAutoLinkState(params, deps, canonicalEntityId) {
	let nextCanonicalEntityId = canonicalEntityId;
	const autoLinkState = {
		autoLinkedEntityName: null,
		autoLinkedEntity: false,
		autoLinkedEntityId: null,
		autoLinkedAliasCreated: false,
		autoLinkedAlias: null,
		autoLinkedAliasId: null,
	};
	if (
		nextCanonicalEntityId === null &&
		(deps.resolveCanonicalEntityIdForCreate || deps.resolveCanonicalEntityId)
	) {
		const resolver = deps.resolveCanonicalEntityIdForCreate || deps.resolveCanonicalEntityId;
		const resolved = await resolver(params.topic);
		nextCanonicalEntityId = resolvedCanonicalId(resolved);
		autoLinkState.autoLinkedEntity = isAutoCreatedCanonical(resolved);
		autoLinkState.autoLinkedEntityId = resolvedCanonicalEntityCreatedId(resolved);
		autoLinkState.autoLinkedEntityName = resolvedCanonicalName(resolved);
		autoLinkState.autoLinkedAliasCreated = isAutoLinkedAliasCreated(resolved);
		autoLinkState.autoLinkedAlias = resolvedCanonicalAlias(resolved);
		autoLinkState.autoLinkedAliasId = resolvedCanonicalAliasId(resolved);
	}
	return { canonicalEntityId: nextCanonicalEntityId, autoLinkState };
}
export function buildCreateSnapshots(entry, autoLinkState, canonicalEntityId, deps) {
	const resolvedEntityName = autoLinkState.autoLinkedEntityName ?? entry.topic;
	const resolvedAlias = autoLinkState.autoLinkedAlias ?? entry.topic.toLowerCase();
	const snapshotPayload =
		autoLinkState.autoLinkedEntity || autoLinkState.autoLinkedAliasCreated
			? {
					...entry,
					_auto_link_auto_created: autoLinkState.autoLinkedEntity,
					_auto_link_entity_created: autoLinkState.autoLinkedEntity,
					_auto_link_entity_id: autoLinkState.autoLinkedEntityId ?? canonicalEntityId,
					_auto_link_entity_name: resolvedEntityName,
					_auto_link_alias_created: autoLinkState.autoLinkedAliasCreated,
					_auto_link_alias: resolvedAlias,
					_auto_link_alias_id: autoLinkState.autoLinkedAliasId,
				}
			: entry;
	const afterSnapshot = deps.serialize(snapshotPayload);
	const autoLinkPlan =
		autoLinkState.autoLinkedEntity || autoLinkState.autoLinkedAliasCreated
			? {
					entity_id: autoLinkState.autoLinkedEntityId ?? canonicalEntityId ?? deps.generateId(),
					entity_name: resolvedEntityName,
					alias_id: autoLinkState.autoLinkedAliasId ?? deps.generateId(),
					alias: resolvedAlias,
					entity_created: autoLinkState.autoLinkedEntity,
					alias_created: autoLinkState.autoLinkedAliasCreated,
				}
			: null;
	return { afterSnapshot, autoLinkPlan };
}
export async function resolveTopicCanonicalEntityId(topic, deps) {
	if (topic === undefined || !deps.resolveCanonicalEntityId) {
		return null;
	}
	return resolvedCanonicalId(await deps.resolveCanonicalEntityId(topic));
}
