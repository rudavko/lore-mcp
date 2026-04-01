/** @implements FR-009 — Effects-backed graph update/upsert MCP tool handlers. */
function tripleUpdateFields() {
	return ["predicate", "object", "source", "actor", "confidence", "valid_from", "valid_to"];
}
function hasAnyPatchField(args, fields) {
	for (let i = 0; i < fields.length; i++) {
		const key = fields[i];
		if (args[key] !== undefined) {
			return true;
		}
	}
	return false;
}
/** Handle "update_triple" tool. */
export async function handleUpdateTriple(args, deps) {
	const validityError = deps.validation.validateValidityInterval(
		args,
		deps.isInfiniteValidTo,
		deps.std,
	);
	if (validityError !== null) {
		throw validityError;
	}
	if (!hasAnyPatchField(args, tripleUpdateFields())) {
		throw deps.validation.buildValidationError("No fields to update");
	}
	await deps.checkPolicy("update_triple", { id: args.id, confidence: args.confidence });
	const triple = await deps.updateTriple(args.id, args);
	deps.notifyResourceChange("triple");
	return deps.formatResult(
		"Updated triple " + triple.id,
		deps.graphPublic.normalizeTriple(triple, deps.normalizeValidToState),
		"knowledge://graph/triples/" + triple.id,
	);
}
/** Handle "upsert_triple" tool. */
export async function handleUpsertTriple(args, deps) {
	const validityError = deps.validation.validateValidityInterval(
		args,
		deps.isInfiniteValidTo,
		deps.std,
	);
	if (validityError !== null) {
		throw validityError;
	}
	await deps.checkPolicy("upsert_triple", args);
	const result = await deps.upsertTriple(args);
	deps.notifyResourceChange("triple");
	return deps.formatResult(
		result.created
				? "Created triple " + result.triple.id
				: "Updated triple " + result.triple.id,
		{
			...deps.graphPublic.normalizeTriple(result.triple, deps.normalizeValidToState),
			created: result.created,
		},
		"knowledge://graph/triples/" + result.triple.id,
	);
}
