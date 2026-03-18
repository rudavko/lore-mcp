/** @implements NFR-001 — Shared worker-test KV and execution-context helpers. */
import { createMemoryKv as createSharedMemoryKv } from "./memory-kv.test.js";

export function createMemoryKv(options = {}) {
	return createSharedMemoryKv(options);
}

export function createCtx() {
	return {
		waitUntil: (_promise) => {},
		passThroughOnException: () => {},
	};
}
