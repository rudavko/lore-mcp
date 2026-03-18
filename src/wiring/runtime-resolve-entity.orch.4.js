/** @implements FR-001 — Canonical entity resolution helpers for runtime entry creation/update. */
import { nowIso } from "./runtime-value-helpers.orch.3.js";

function makeResolveCanonicalEntityIdForCreate(deps) {
	return async (topic) => {
		if (typeof topic !== "string") {
			return null;
		}
		const normalizedTopic = topic.trim();
		if (normalizedTopic.length === 0) {
			return null;
		}
		const normalizedAlias = normalizedTopic.toLowerCase();
		const aliasRow = await deps.resolveAliasRow(deps.db, normalizedAlias);
		if (aliasRow !== null && typeof aliasRow.id === "string") {
			return { id: aliasRow.id, auto_created: false, name: aliasRow.name ?? normalizedTopic };
		}
		const byNameRow = await deps.selectEntityByName(deps.db, normalizedTopic);
		if (byNameRow !== null && typeof byNameRow.id === "string") {
			return {
				id: byNameRow.id,
				auto_created: false,
				name: byNameRow.name ?? normalizedTopic,
				auto_link_entity_created: false,
				auto_link_alias_created: true,
				auto_link_alias: normalizedAlias,
				auto_link_alias_id: deps.generateId(),
			};
		}
		const candidateId = deps.generateId();
		return {
			id: candidateId,
			auto_created: true,
			name: normalizedTopic,
			auto_link_entity_created: true,
			auto_link_entity_id: candidateId,
			auto_link_alias_created: true,
			auto_link_alias: normalizedAlias,
			auto_link_alias_id: deps.generateId(),
		};
	};
}

function makeResolveCanonicalEntityId(deps) {
	return async (topic) => {
		if (typeof topic !== "string") {
			return null;
		}
		const normalizedTopic = topic.trim();
		if (normalizedTopic.length === 0) {
			return null;
		}
		const normalizedAlias = normalizedTopic.toLowerCase();
		const aliasRow = await deps.resolveAliasRow(deps.db, normalizedAlias);
		if (aliasRow !== null && typeof aliasRow.id === "string") {
			return { id: aliasRow.id, auto_created: false, name: aliasRow.name ?? normalizedTopic };
		}
		const byNameRow = await deps.selectEntityByName(deps.db, normalizedTopic);
		if (byNameRow !== null && typeof byNameRow.id === "string") {
			await deps.db
				.prepare(`INSERT OR IGNORE INTO entity_aliases (id, alias, canonical_entity_id, created_at) VALUES (?, ?, ?, ?)`)
				.bind(deps.generateId(), normalizedAlias, byNameRow.id, nowIso(deps.std))
				.run();
			return { id: byNameRow.id, auto_created: false, name: byNameRow.name ?? normalizedTopic };
		}
		const candidateId = deps.generateId();
		const aliasId = deps.generateId();
		const createdAt = nowIso(deps.std);
		await deps.db.batch([
			deps.db.prepare(`INSERT OR IGNORE INTO canonical_entities (id, name, created_at) VALUES (?, ?, ?)`).bind(candidateId, normalizedTopic, createdAt),
			deps.db.prepare(`INSERT OR IGNORE INTO entity_aliases (id, alias, canonical_entity_id, created_at)
				 SELECT ?, ?, id, ? FROM canonical_entities WHERE name = ?`).bind(
				aliasId,
				normalizedAlias,
				createdAt,
				normalizedTopic,
			),
		]);
		const resolvedRow = await deps.selectEntityByName(deps.db, normalizedTopic);
		if (resolvedRow === null || typeof resolvedRow.id !== "string") {
			return null;
		}
		return {
			id: resolvedRow.id,
			auto_created: resolvedRow.id === candidateId,
			name: resolvedRow.name ?? normalizedTopic,
		};
	};
}

export { makeResolveCanonicalEntityId, makeResolveCanonicalEntityIdForCreate };
