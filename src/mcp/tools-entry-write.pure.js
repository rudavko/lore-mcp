/** @implements FR-004 — Shared entry write-argument normalization helpers for MCP tools. */
import { buildValidationError } from "./tools-core.pure.js";

export function validateTtlSeconds(args, std) {
	const ttl = args.ttl_seconds;
	if (ttl === undefined || ttl === null) {
		return null;
	}
	if (
		typeof ttl !== "number" ||
		!std.Number.isInteger(ttl) ||
		!std.Number.isSafeInteger(ttl) ||
		ttl <= 0
	) {
		return buildValidationError("Invalid ttl_seconds (must be positive integer)");
	}
	return null;
}

export function normalizeTtlSecondsArg(args, std) {
	const ttl = args.ttl_seconds;
	if (ttl === undefined || ttl === null || typeof ttl === "number") {
		return { args, error: null };
	}
	if (typeof ttl !== "string") {
		return {
			args,
			error: buildValidationError("Invalid ttl_seconds (must be positive integer)"),
		};
	}
	const trimmed = ttl.trim();
	if (!/^\d+$/u.test(trimmed)) {
		return {
			args,
			error: buildValidationError("Invalid ttl_seconds (must be positive integer)"),
		};
	}
	const parsed = std.Number(trimmed);
	if (!std.Number.isInteger(parsed) || !std.Number.isSafeInteger(parsed) || parsed <= 0) {
		return {
			args,
			error: buildValidationError("Invalid ttl_seconds (must be positive integer)"),
		};
	}
	return { args: { ...args, ttl_seconds: parsed }, error: null };
}

export function ensureEntryUpdatePatch(args) {
	if (
		args.topic !== undefined ||
		args.content !== undefined ||
		args.tags !== undefined ||
		args.source !== undefined ||
		args.actor !== undefined ||
		args.confidence !== undefined ||
		args.ttl_seconds !== undefined ||
		args.valid_from !== undefined ||
		args.valid_to !== undefined ||
		args.knowledge_type !== undefined ||
		args.memory_type !== undefined ||
		args.status !== undefined
	) {
		return null;
	}
	return buildValidationError("No fields to update");
}
