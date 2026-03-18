/** @implements FR-007, FR-008, FR-009, FR-010 — Register graph mutation/query MCP tools. */
import { runConflictAwareGraphWrite } from "./tools-register-graph-flow.pure.js";
import {
	buildRelateWriteFlow,
	buildUpsertWriteFlow,
	buildQueryGraphDeps,
	buildUpdateTripleDeps,
	buildResolveReplaceDeps,
	buildResolveRetainDeps,
} from "./tools-register-graph-deps.pure.js";

export const _MODULE = "tools-register-graph.pure";
/** Register graph-related tools. */
export function registerGraphTools(server, schemas, deps) {
	const tool = (name, description, schema, handler) => {
		server.tool(name, description, schema, handler);
	};
	const handleResolveConflict = (args) =>
		deps.loadConflict(args.conflict_id).then((conflict) => {
			if (conflict === null) {
				return deps.formatError(deps.throwNotFound("Conflict", args.conflict_id));
			}
			if (args.strategy === "reject") {
				return deps.efctResolveReject(args, {
					removeConflict: deps.removeConflict,
					formatResult: deps.formatResult,
				});
			}
			if (args.strategy === "replace") {
				return deps.efctResolveReplace(
					{ ...args, conflict },
					buildResolveReplaceDeps(deps),
				);
			}
			return deps.efctResolveRetain(
				{ ...args, conflict },
				buildResolveRetainDeps(deps),
			);
		});
	tool(
		"relate",
		"Create a graph triple (subject-predicate-object relationship)",
		schemas.relate,
		(args) => runConflictAwareGraphWrite(args, buildRelateWriteFlow(deps)),
	);
	tool(
		"query_graph",
		"Query graph triples (all filters AND'd, substring match)",
		schemas.query_graph,
		(args) => deps.efctQueryGraph(args, buildQueryGraphDeps(deps)),
	);
	tool("update_triple", "Update an existing triple's fields", schemas.update_triple, (args) =>
		deps.efctUpdateTriple(args, buildUpdateTripleDeps(deps)),
	);
	tool(
		"upsert_triple",
		"Create or update a triple by subject+predicate",
		schemas.upsert_triple,
		(args) => runConflictAwareGraphWrite(args, buildUpsertWriteFlow(deps)),
	);
	tool(
		"resolve_conflict",
		"Resolve a detected triple conflict",
		schemas.resolve_conflict,
		handleResolveConflict,
	);
}
