/** @implements FR-001, ADR-0001, FR-011, FR-019 — Thin composition root for runtime and worker assembly. */
import { createLoreMcpApp } from "./index-app-services.orch.2.js";
import { createWorkerServices } from "./index-worker-services.orch.2.js";

export const _MODULE = "index.orch";

const runtimeGlobal = globalThis;
const loreMcpApp = createLoreMcpApp(runtimeGlobal);
const workerServices = createWorkerServices(runtimeGlobal, loreMcpApp);

export const LoreMcp = workerServices.LoreMcp;
export const worker = workerServices.worker;
