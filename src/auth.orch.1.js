/** @implements FR-018, FR-011, NFR-006 — Auth route orchestration for OAuth 2.1 + passphrase + passkey/TOTP flows, including credential enrollment/rotation surfaces. */
import { createAuthRouteHandlers } from "./auth-route-handlers.orch.2.js";
import { createAuthRouteDeps, registerAuthRouteTable } from "./auth-route-deps.orch.2.js";


/** Register auth routes on the given router. */
export function registerAuthRoutes(router, deps) {
	const handlers = createAuthRouteHandlers(createAuthRouteDeps(deps));
	registerAuthRouteTable(router, handlers);
}
