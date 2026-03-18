/** @implements FR-001 — Triple CRUD/query runtime orchestration. */
import {
	decodeCursor,
	encodeCursor,
	jsonStringifyOrNull,
	noThrowValidation,
	nowIso,
	throwNotFoundValue,
	validationError,
} from "./runtime-value-helpers.orch.3.js";

function buildTripleOps(ctx) {
	const fetchExistingTriple = async (id) => {
		const row = await ctx.selectTripleRow(ctx.db, id);
		if (row === null) {
			throw throwNotFoundValue("Triple", id);
		}
		return ctx.rowToTriple(row);
	};
	const validateTripleInput = (params) => {
		const validation = ctx.validateTripleFields({
			subject: params.subject,
			predicate: params.predicate,
			object: params.object,
			valid_from: params.valid_from ?? undefined,
			valid_to: params.valid_to ?? undefined,
			valid_to_state: params.valid_to_state ?? undefined,
		});
		if (!validation.ok) {
			throw validationError((validation.error && validation.error.message) || "Invalid triple");
		}
	};
	const createTriple = async (params) => {
		validateTripleInput(params);
		return await ctx.triplesOrchCreate(params, {
			validateTripleFields: ctx.validateTripleFields,
			deriveValidToStateFromInput: ctx.deriveValidToStateFromInputForTriple,
			buildTripleObject: ctx.buildTripleObject,
			insertTripleRow: ctx.insertTripleRow,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
			throwValidation: noThrowValidation,
		});
	};
	const updateTriple = async (id, params) => {
		validateTripleInput(params);
		return await ctx.triplesOrchUpdate(id, params, {
			fetchExistingTriple,
			updateTripleRow: ctx.updateTripleRow,
			validateTripleFields: ctx.validateTripleFields,
			deriveValidToStateFromInput: ctx.deriveValidToStateFromInputForTriple,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
			throwValidation: noThrowValidation,
		});
	};
	const findActiveTriples = async (subject, predicate) => {
		return await ctx.triplesOrchFindActive(subject, predicate, {
			queryTripleRows: ctx.queryTripleRows,
			rowToTriple: ctx.rowToTriple,
			db: ctx.db,
		});
	};
	const upsertTriple = async (params) => {
		return await ctx.triplesOrchUpsert(params, {
			findActiveTriples,
			createTriple,
			updateTriple,
		});
	};
	const deleteTriple = async (id) => {
		await ctx.triplesOrchDelete(id, {
			fetchExistingTriple,
			softDeleteTripleRow: ctx.softDeleteTripleRow,
			generateId: ctx.generateId,
			now: () => nowIso(ctx.std),
			serialize: (value) => jsonStringifyOrNull(value, ctx.std),
			db: ctx.db,
		});
	};
	const queryTriples = async (params) => {
		return await ctx.triplesOrchQuery(params, {
			buildWhereClause: (p, decoded) => {
				const q = ctx.buildTripleQueryConditions(p, decoded);
				return { whereClause: q.conditions.join(" AND "), binds: q.binds };
			},
			queryTripleRows: ctx.queryTripleRows,
			rowToTriple: ctx.rowToTriple,
			decodeCursor: (raw) => decodeCursor(raw, ctx.std),
			encodeCursor: (value) => encodeCursor(value, ctx.std),
			db: ctx.db,
		});
	};
	return {
		createTriple,
		deleteTriple,
		findActiveTriples,
		queryTriples,
		updateTriple,
		upsertTriple,
	};
}

export { buildTripleOps };
