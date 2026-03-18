/** @implements NFR-001 — Shared MCP handler-test helper bundles for injected validation and shaping seams. */
import { safeStringEqual } from "../lib/constant-time-equal.pure.js";
import { createGlobalTestStd } from "../test-helpers/runtime.shared.test.js";
import { buildValidationError } from "./tools-core.pure.js";
import { ensureValidCursor } from "./tools-cursor.pure.js";
import {
	normalizeMutationEntry,
	normalizeQueryEntry,
} from "./tools-entry-public.pure.js";
import {
	ensureEntryUpdatePatch,
	normalizeTtlSecondsArg,
	validateTtlSeconds,
} from "./tools-entry-write.pure.js";
import { normalizeTriple } from "./tools-graph-public.pure.js";
import { asRecord, stripValidityFieldsDeep } from "./tools-public-record.pure.js";
import {
	filterItemsByAsOf,
	parseOptionalAsOf,
	validateValidityInterval,
} from "./tools-validation.pure.js";

export const std = createGlobalTestStd(globalThis);

export function isInfiniteValidTo(value) {
	const normalized = value.trim().toLowerCase();
	return normalized === "infinite" || normalized === "infinity" || normalized === "forever";
}

export function normalizeValidToState(rawState, validTo) {
	if (rawState === "unspecified" || rawState === "infinite" || rawState === "bounded") {
		return rawState;
	}
	return validTo === null ? "unspecified" : "bounded";
}

export const cursor = {
	ensureValidCursor,
};

export const entryPublic = {
	normalizeMutationEntry,
	normalizeQueryEntry,
};

export const entryWrite = {
	ensureEntryUpdatePatch,
	normalizeTtlSecondsArg,
	validateTtlSeconds,
};

export const graphPublic = {
	normalizeTriple,
};

export const recordPublic = {
	asRecord,
	stripValidityFieldsDeep,
};

export const validation = {
	buildValidationError,
	filterItemsByAsOf,
	parseOptionalAsOf,
	validateValidityInterval,
};

export const constantTimeString = {
	safeStringEqual,
};

export function withEntryHandlerDeps(overrides = {}) {
	return {
		std,
		entryPublic,
		entryWrite,
		isInfiniteValidTo,
		normalizeValidToState,
		validation,
		...overrides,
	};
}

export function withGraphHandlerDeps(overrides = {}) {
	return {
		std,
		graphPublic,
		isInfiniteValidTo,
		normalizeValidToState,
		recordPublic,
		validation,
		...overrides,
	};
}

export function withCursorHandlerDeps(overrides = {}) {
	return {
		std,
		cursor,
		...overrides,
	};
}

export function withEntryQueryHandlerDeps(overrides = {}) {
	return {
		std,
		cursor,
		entryPublic,
		recordPublic,
		normalizeValidToState,
		validation,
		...overrides,
	};
}

export function withGraphQueryHandlerDeps(overrides = {}) {
	return {
		std,
		cursor,
		graphPublic,
		normalizeValidToState,
		...overrides,
	};
}

export function withEnableAutoUpdatesDeps(overrides = {}) {
	return {
		std,
		validation,
		...overrides,
	};
}
