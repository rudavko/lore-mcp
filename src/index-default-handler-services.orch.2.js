/** @implements FR-011 — Thin default-handler factory over a dedicated browser-route config builder. */
import { makeDefaultHandlerFetch } from "./wiring/default-handler.orch.1.js";
import { createDefaultHandlerConfig } from "./wiring/default-handler-config.orch.3.js";

function createDefaultHandlerFetch(runtimeGlobal) {
	return makeDefaultHandlerFetch(createDefaultHandlerConfig(runtimeGlobal));
}

export { createDefaultHandlerFetch };
