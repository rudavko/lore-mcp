/** @implements NFR-001 — Test preload shims for Cloudflare platform modules under Bun. */
import { mock } from "bun:test";
function workerEntrypoint(_state, env) {
	return {
		env,
		ctx: { props: {} },
	};
}
function durableObject(_state, _env) {}
function workflowEntrypoint(_state, _env) {}
function emailMessage(_message) {}
mock.module("cloudflare:workers", () => ({
	WorkerEntrypoint: workerEntrypoint,
	DurableObject: durableObject,
	WorkflowEntrypoint: workflowEntrypoint,
	env: {},
}));
mock.module("cloudflare:email", () => ({ EmailMessage: emailMessage }));
// Prevent OAuth provider CIMD warnings under Bun tests by mirroring CF flag shape.
globalThis.Cloudflare = {
	compatibilityFlags: { global_fetch_strictly_public: true },
};
