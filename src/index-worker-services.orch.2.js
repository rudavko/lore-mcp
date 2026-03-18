/** @implements FR-011 — Worker surface assembly for MCP API and OAuth provider wiring. */
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { createLoreMcpCtor } from "./wiring/mcp-agent.efct.js";
import { makeCompatMcpApiHandler } from "./wiring/mcp-api-handler.efct.js";

function createWorkerServices(runtimeGlobal, initLoreMcp, processLoreIngestion, defaultHandlerFetch) {
	const LoreMcp = createLoreMcpCtor({
		McpAgentCtor: McpAgent,
		proxyCtor: runtimeGlobal.Proxy,
		reflectConstruct: runtimeGlobal.Reflect.construct,
		defineProperties: runtimeGlobal.Object.defineProperties,
		init: initLoreMcp,
		processIngestion: processLoreIngestion,
	});
	const loreMcpApiHandler = LoreMcp.serve("/mcp");
	const compatMcpApiHandler = makeCompatMcpApiHandler({
		loreMcpApiHandler,
		headersCtor: runtimeGlobal.Headers,
		requestCtor: runtimeGlobal.Request,
	});
	const worker = new OAuthProvider({
		apiRoute: "/mcp",
		apiHandler: compatMcpApiHandler,
		defaultHandler: { fetch: defaultHandlerFetch },
		authorizeEndpoint: "/authorize",
		tokenEndpoint: "/token",
		clientRegistrationEndpoint: "/register",
	});
	return { LoreMcp, worker };
}

export { createWorkerServices };
