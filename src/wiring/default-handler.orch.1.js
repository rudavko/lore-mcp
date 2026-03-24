/** @implements FR-001 — Orchestrate default auth route handling via injected runtime dependencies. */
import { createDefaultHandlerHelpers } from "./default-handler-helpers.orch.2.js";
import { createDefaultHandlerHost } from "./default-handler-host.orch.3.js";
import { createDefaultHandlerRequestContext } from "./default-handler-request-context.orch.2.js";
import { registerDefaultHandlerRoutes } from "./default-handler-routes.orch.2.js";

export const makeDefaultHandlerFetch = (deps) => {
	const {
		parseCookies,
		randomTokenHex,
		formatSecretForDisplay,
		safeStringEqual,
		verifyTotp,
		createSimpleRouter,
		ensureResponse,
	} = createDefaultHandlerHelpers(deps);
	return async (request, env) => {
		const host = createDefaultHandlerHost(request, env);
		const requestContext = createDefaultHandlerRequestContext(deps, request, host, {
			parseCookies,
		});
		const router = createSimpleRouter();
		registerDefaultHandlerRoutes(router, {
			config: deps,
			request,
			http: requestContext,
			helpers: {
				randomTokenHex,
				safeStringEqual,
				formatSecretForDisplay,
				verifyTotp,
			},
		});
		const handled = await router.handle(request.method, requestContext.url.pathname);
		if (handled === null) {
			return requestContext.textResponse("Not found", 404);
		}
		return ensureResponse(handled);
	};
};
