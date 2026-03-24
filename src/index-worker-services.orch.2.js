/** @implements FR-011 — Worker surface assembly for MCP API and OAuth provider wiring. */
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { makeCompatMcpApiHandler } from "./wiring/mcp-api-handler.efct.js";

function createWorkerServices(runtimeGlobal, loreMcpApp) {
	const LoreMcp = loreMcpApp.LoreMcp;
	const loreMcpApiHandler = LoreMcp.serve("/mcp");
	const compatMcpApiHandler = makeCompatMcpApiHandler({
		loreMcpApiHandler,
		headersCtor: runtimeGlobal.Headers,
		requestCtor: runtimeGlobal.Request,
	});
	const worker = new OAuthProvider({
		apiRoute: "/mcp",
		apiHandler: compatMcpApiHandler,
		defaultHandler: { fetch: loreMcpApp.defaultHandlerFetch },
		authorizeEndpoint: "/authorize",
		tokenEndpoint: "/token",
		clientRegistrationEndpoint: "/register",
	});
	return { LoreMcp, worker };
}

export { createWorkerServices };
