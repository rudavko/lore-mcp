/** @implements FR-001 — Top-level Lore MCP server configuration orchestration. */
import { createWiringCore } from "./runtime-configure-core.orch.3.js";
import { createRuntimeOps } from "./runtime-configure-runtime-ops.orch.3.js";
import { buildToolsDeps } from "./runtime-tools-deps.orch.3.js";
import { registerServerSurface } from "./runtime-server-registration.orch.3.js";

function makeConfigureLoreServer(deps) {
	return function configureLoreServer(server, env) {
		const serverRecord = server;
		const core = createWiringCore({ ...deps, env, serverRecord });
		const runtimeOps = createRuntimeOps(core, deps, env);
		const toolsDeps = buildToolsDeps(core, runtimeOps, deps, env);
		registerServerSurface({
			serverRecord,
			core,
			toolsDeps,
			deps,
			env,
		});
	};
}

export { makeConfigureLoreServer };
