/** @implements FR-001 — Server-surface registration for tools, resources, prompts, and subscriptions. */
import {
	decodeCursor,
	jsonStringifyOrNull,
} from "./runtime-value-helpers.orch.3.js";
import {
	installPrompts,
	installSubscriptions,
	wrapToolHandler,
} from "./runtime-surface.orch.3.js";

function registerServerSurface({ serverRecord, core, toolsDeps, deps, dbQuery }) {
	const serverWithErrorBoundary = {
		tool: (name, desc, schema, handler) => {
			const wrappedHandler = wrapToolHandler((args, extra) => handler(args, extra), toolsDeps.formatError);
			serverRecord.tool(name, desc, schema, wrappedHandler);
		},
	};
	deps.registerTools(serverWithErrorBoundary, toolsDeps);
	deps.registerResources(serverRecord, {
		createResourceTemplate: (uri, list) => new deps.resourceTemplateCtor(uri, { list }),
		rowToEntry: core.mapEntryRow,
		rowToTriple: deps.rowToTriple,
		decodeCursor: (raw) => decodeCursor(raw, deps.std),
		dbQuery,
		btoa: deps.std.btoa,
		jsonStringify: (value) => jsonStringifyOrNull(value, deps.std),
	});
	installPrompts(serverRecord, {
		buildIngestMemoryPrompt: deps.buildIngestMemoryPrompt,
		buildRetrieveContextPrompt: deps.buildRetrieveContextPrompt,
		buildCorrectStaleFactsPrompt: deps.buildCorrectStaleFactsPrompt,
	});
	installSubscriptions(serverRecord);
}

export { registerServerSurface };
