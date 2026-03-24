/** @implements FR-001 — Route-runtime registration helpers for the default HTTP handler. */

export function registerDefaultHandlerRoutes(router, ctx) {
	const routeRegistration = ctx.config.routeRegistration;
	const adapters = ctx.adapters;
	routeRegistration.registerAuthRoutes(router, adapters.createAuthRouteDeps(ctx));
	routeRegistration.registerAdminRoutes(
		adapters.createPrefixedRouter(router, "/admin"),
		adapters.createAdminRouteDeps(ctx),
	);
}
