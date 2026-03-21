/** @implements FR-018, FR-011, NFR-006 — Auth route-flow orchestration helpers over injected HTTP/runtime deps. */
import { handleAuthorize } from "./auth-route-authorize.orch.3.js";
import { handleApprove } from "./auth-route-approve.orch.3.js";
import {
	handleEnrollPasskey,
	handleCompletePasskeySkip,
	handleEnrollTotpRedirect,
	handleEnrollTotp,
} from "./auth-route-enroll.orch.3.js";

function formatAuthHandlerError(error) {
	return error instanceof Error ? "Internal auth error." : "Internal auth error.";
}

function wrapAuthHandler(deps, handler) {
	return async () => {
		try {
			return await handler(deps);
		} catch (error) {
			return deps.textResponse(formatAuthHandlerError(error), 500);
		}
	};
}

export function createAuthRouteHandlers(deps) {
	return {
		handleRoot: wrapAuthHandler(deps, () =>
			deps.textResponse("Lore MCP is running. Connect via /mcp", 200),
		),
		handleAuthorize: wrapAuthHandler(deps, handleAuthorize),
		handleApprove: wrapAuthHandler(deps, handleApprove),
		handleEnrollPasskey: wrapAuthHandler(deps, handleEnrollPasskey),
		handleCompletePasskeySkip: wrapAuthHandler(deps, handleCompletePasskeySkip),
		handleEnrollTotpRedirect: wrapAuthHandler(deps, handleEnrollTotpRedirect),
		handleEnrollTotp: wrapAuthHandler(deps, handleEnrollTotp),
	};
}
