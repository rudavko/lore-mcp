/** @implements FR-001 — MCP API handler compatibility adapter for Accept header normalization. */
export const _MODULE = "mcp-api-handler.efct";
export const makeCompatMcpApiHandler = (deps) => {
	function normalizeAcceptIfNeeded(request, env) {
		const hasDurableGet = !!(env.MCP_OBJECT && typeof env.MCP_OBJECT.get === "function");
		if (!hasDurableGet) {
			return request;
		}
		const accept = request.headers.get("accept") || "";
		if (accept.includes("text/event-stream")) {
			return request;
		}
		if (!accept.includes("application/json") && !accept.includes("*/*") && accept.length > 0) {
			return request;
		}
		const headers = new deps.headersCtor(request.headers);
		if (accept.length > 0) {
			headers.set("accept", `${accept}, text/event-stream`);
		} else {
			headers.set("accept", "application/json, text/event-stream");
		}
		return new deps.requestCtor(request, { headers });
	}
	return {
		fetch: (request, env, ctx) => {
			const envRec = env && typeof env === "object" ? env : {};
			const incoming = normalizeAcceptIfNeeded(request, envRec);
			return deps.loreMcpApiHandler.fetch(incoming, envRec, ctx);
		},
	};
};
