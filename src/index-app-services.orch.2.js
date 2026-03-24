/** @implements FR-001, FR-003, FR-011 — Platform-agnostic Lore MCP app assembly. */
import { createRuntimeServices } from "./index-runtime-services.orch.2.js";
import { createDefaultHandlerFetch } from "./index-default-handler-services.orch.2.js";
import { createLoreMcpCtor } from "./wiring/mcp-agent.efct.js";
import { McpAgent } from "agents/mcp";

function createLoreMcpApp(runtimeGlobal) {
	const runtimeServices = createRuntimeServices(runtimeGlobal);
	const defaultHandlerFetch = createDefaultHandlerFetch(runtimeGlobal);
	const LoreMcp = createLoreMcpCtor({
		McpAgentCtor: McpAgent,
		proxyCtor: runtimeGlobal.Proxy,
		reflectConstruct: runtimeGlobal.Reflect.construct,
		defineProperties: runtimeGlobal.Object.defineProperties,
		init: runtimeServices.initLoreMcp,
		processIngestion: runtimeServices.processLoreIngestion,
	});
	return {
		...runtimeServices,
		defaultHandlerFetch,
		LoreMcp,
	};
}

export { createLoreMcpApp };
