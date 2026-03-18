/** @implements FR-001, ADR-0001, FR-011, FR-019 — Thin composition root for runtime and worker assembly. */
import { createRuntimeServices } from "./index-runtime-services.orch.2.js";
import { createDefaultHandlerFetch } from "./index-default-handler-services.orch.2.js";
import { createWorkerServices } from "./index-worker-services.orch.2.js";

export const _MODULE = "index.orch";

const runtimeGlobal = globalThis;
const runtimeServices = createRuntimeServices(runtimeGlobal);
const defaultHandlerFetch = createDefaultHandlerFetch(runtimeGlobal);
const workerServices = createWorkerServices(
	runtimeGlobal,
	runtimeServices.initLoreMcp,
	runtimeServices.processLoreIngestion,
	defaultHandlerFetch,
);

export const LoreMcp = workerServices.LoreMcp;
export const worker = workerServices.worker;
