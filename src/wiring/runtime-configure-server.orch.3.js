/** @implements FR-001 — Top-level Lore MCP server configuration orchestration. */
import { createWiringCore } from "./runtime-configure-core.orch.3.js";
import { createCoreHostDeps } from "./runtime-configure-host.orch.4.js";
import { createRuntimeOps } from "./runtime-configure-runtime-ops.orch.3.js";
import { buildToolsDeps } from "./runtime-tools-deps.orch.3.js";
import { makeDbQuery } from "./runtime-surface.orch.3.js";
import { createToolsHostDeps } from "./runtime-tools-host.orch.4.js";
import { registerServerSurface } from "./runtime-server-registration.orch.3.js";

function makeConfigureLoreServer(deps) {
	return function configureLoreServer(server, env) {
		const serverRecord = server;
		const coreHostDeps = createCoreHostDeps(env);
		const core = createWiringCore({ ...deps, ...coreHostDeps, serverRecord });
		const runtimeOps = createRuntimeOps(core, deps, env);
		const toolsHostDeps = createToolsHostDeps(env, deps);
		const toolsDeps = buildToolsDeps(core, runtimeOps, deps, toolsHostDeps);
		registerServerSurface({
			serverRecord,
			core,
			toolsDeps,
			deps,
			dbQuery: makeDbQuery(toolsHostDeps.db),
		});
	};
}

export { makeConfigureLoreServer };
