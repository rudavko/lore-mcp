/** @implements FR-007, FR-008, FR-009, FR-010 — Shared dependency builders for graph-tool registration. */
import { buildValidationError } from "./tools-core.pure.js";
import { ensureValidCursor } from "./tools-cursor.pure.js";
import { normalizeTriple } from "./tools-graph-public.pure.js";
import { stripValidityFieldsDeep } from "./tools-public-record.pure.js";
import { validateValidityInterval } from "./tools-validation.pure.js";

function buildGraphPublicDeps(deps) {
	return {
		graphPublic: {
			normalizeTriple,
		},
		normalizeValidToState: deps.normalizeValidToState,
	};
}

function buildConflictHandlerDeps(deps) {
	return {
		checkPolicy: deps.checkPolicy,
		formatResult: deps.formatResult,
		...buildGraphPublicDeps(deps),
		isInfiniteValidTo: deps.isInfiniteValidTo,
		logEvent: deps.logEvent,
		recordPublic: {
			stripValidityFieldsDeep,
		},
		saveConflict: deps.saveConflict,
		std: deps.std,
		validation: {
			validateValidityInterval,
		},
	};
}

function buildRelateCreateDeps(deps) {
	return {
		checkPolicy: deps.checkPolicy,
		createTriple: deps.createTriple,
		formatResult: deps.formatResult,
		...buildGraphPublicDeps(deps),
		isInfiniteValidTo: deps.isInfiniteValidTo,
		logEvent: deps.logEvent,
		notifyResourceChange: deps.notifyResourceChange,
		std: deps.std,
		validation: {
			validateValidityInterval,
		},
	};
}

function buildUpsertTripleDeps(deps) {
	return {
		checkPolicy: deps.checkPolicy,
		formatResult: deps.formatResult,
		...buildGraphPublicDeps(deps),
		isInfiniteValidTo: deps.isInfiniteValidTo,
		notifyResourceChange: deps.notifyResourceChange,
		std: deps.std,
		upsertTriple: deps.upsertTriple,
		validation: {
			buildValidationError,
			validateValidityInterval,
		},
	};
}

function buildConflictAwareWriteDeps({ deps, policyName, runMulti, runSingle }) {
	return {
		policyName,
		checkPolicy: deps.checkPolicy,
		detectConflict: deps.detectConflict,
		formatError: deps.formatError,
		isInfiniteValidTo: deps.isInfiniteValidTo,
		isPredicateMulti: deps.isPredicateMulti,
		runConflict: (rawArgs, conflict) =>
			deps.efctRelateConflict({ ...rawArgs, conflict }, buildConflictHandlerDeps(deps)),
		runMulti,
		runSingle,
		std: deps.std,
		validateValidityInterval,
		validatePromotionRelation: deps.validatePromotionRelation,
	};
}

export function buildRelateWriteFlow(deps) {
	const createDeps = buildRelateCreateDeps(deps);
	const runCreate = (rawArgs) => deps.efctRelateCreate(rawArgs, createDeps);
	return buildConflictAwareWriteDeps({
		deps,
		policyName: "relate",
		runMulti: runCreate,
		runSingle: runCreate,
	});
}

export function buildUpsertWriteFlow(deps) {
	const upsertDeps = buildUpsertTripleDeps(deps);
	return buildConflictAwareWriteDeps({
		deps,
		policyName: "upsert_triple",
		runMulti: (rawArgs) =>
			deps.efctUpsertTriple({ ...rawArgs, predicate_multi: true }, upsertDeps),
		runSingle: (rawArgs) => deps.efctUpsertTriple(rawArgs, upsertDeps),
	});
}

export function buildQueryGraphDeps(deps) {
	return {
		cursor: {
			ensureValidCursor,
		},
		...buildGraphPublicDeps(deps),
		std: deps.std,
		queryTriples: deps.queryTriples,
		formatResult: deps.formatResult,
	};
}

export function buildUpdateTripleDeps(deps) {
	return {
		checkPolicy: deps.checkPolicy,
		std: deps.std,
		...buildGraphPublicDeps(deps),
		validation: {
			buildValidationError,
			validateValidityInterval,
		},
		updateTriple: deps.updateTriple,
		notifyResourceChange: deps.notifyResourceChange,
		isInfiniteValidTo: deps.isInfiniteValidTo,
		formatResult: deps.formatResult,
	};
}

export function buildResolveReplaceDeps(deps) {
	return {
		std: deps.std,
		...buildGraphPublicDeps(deps),
		removeConflict: deps.removeConflict,
		updateTriple: deps.updateTriple,
		notifyResourceChange: deps.notifyResourceChange,
		logEvent: deps.logEvent,
		formatResult: deps.formatResult,
	};
}

export function buildResolveRetainDeps(deps) {
	return {
		std: deps.std,
		...buildGraphPublicDeps(deps),
		removeConflict: deps.removeConflict,
		createTriple: deps.createTriple,
		notifyResourceChange: deps.notifyResourceChange,
		formatResult: deps.formatResult,
	};
}
