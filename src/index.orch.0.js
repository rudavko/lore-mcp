/** @implements FR-001, ADR-0001, FR-011, FR-019 — Thin export surface for worker composition. */
import {
	_MODULE as INDEX_CORE_MODULE,
	LoreMcp as INDEX_CORE_LORE_MCP,
	worker as INDEX_CORE_WORKER,
} from "./index-core.orch.1.js";

export const _MODULE = INDEX_CORE_MODULE;
export const LoreMcp = INDEX_CORE_LORE_MCP;
export const worker = INDEX_CORE_WORKER;
