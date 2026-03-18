/** @implements FR-001 — Route-runtime registration helpers for the default HTTP handler. */
import { createDefaultHandlerAdminRouteDeps, createPrefixedRouter } from "./default-handler-admin-adapter.orch.3.js";
import { createDefaultHandlerAuthRouteDeps } from "./default-handler-auth-adapter.orch.3.js";

export function registerDefaultHandlerRoutes(router, ctx) {
	const routeRegistration = ctx.config.routeRegistration;
	routeRegistration.registerAuthRoutes(router, createDefaultHandlerAuthRouteDeps(ctx));
	routeRegistration.registerAdminRoutes(
		createPrefixedRouter(router, "/admin"),
		createDefaultHandlerAdminRouteDeps(ctx),
	);
}
