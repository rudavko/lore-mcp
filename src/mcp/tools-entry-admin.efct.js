/** @implements FR-006 — Effects-backed entry set-type/delete MCP tool handlers. */
function validationError(message) {
	throw { code: "validation", message, retryable: false };
}
/** Handle "set_type" tool. */
export async function handleSetType(args, deps) {
	if (args.knowledge_type === undefined && args.memory_type === undefined) {
		return validationError("No type fields to update");
	}
	const entry = await deps.setEntryTypes(args.id, {
		knowledge_type: args.knowledge_type,
		memory_type: args.memory_type,
	});
	deps.notifyResourceChange("entry");
	return deps.formatResult(
		"Updated entry types for " + args.id,
		{
			id: args.id,
			knowledge_type: entry.knowledge_type,
			memory_type: entry.memory_type,
		},
		"knowledge://entries/" + args.id,
	);
}
/** Handle "delete" tool. */
export async function handleDelete(args, deps) {
	await deps.checkPolicy("delete", args);
	const type = args.entity_type || "entry";
	await deps.deleteByType(type, args.id);
	deps.notifyResourceChange(type);
	deps.logEvent("mutation", { op: "delete", entity_type: type, id: args.id, ok: true });
	return deps.formatResult("Deleted " + type + " " + args.id, {
		id: args.id,
		entity_type: type,
		deleted: true,
	});
}
