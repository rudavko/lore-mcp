export default {
	testRunner: "command",
	commandRunner: {
		command:
			"bun test src/domain/auto-updates-link.test.js src/mcp/tools-enable-auto-updates.test.js src/mcp/tools-build-info.test.js src/wiring/runtime-configure-server.integration.test.js src/wiring/runtime-entry-wiring.test.js src/wiring/runtime-graph-expand.test.js src/wiring/runtime-like-query.test.js src/wiring/runtime-like-fallback.test.js src/wiring/runtime-ingestion-retry.test.js src/wiring/runtime-prompts-binding.test.js src/wiring/runtime-tool-error-boundary.test.js src/wiring/runtime-semantic-threshold.test.js src/wiring/default-handler.orch.test.js src/wiring/default-handler-helpers.test.js src/wiring/default-handler-lookup.e2e.test.js src/wiring/default-handler-passkey-uv.e2e.test.js src/wiring/admin-install-workflow.e2e.test.js src/regression-surface.e2e.test.js src/admin.efct.test.js src/auth.orch.test.js src/auth-route-handlers.test.js src/auth-wiring.e2e.test.js src/auth.test.js",
	},
	coverageAnalysis: "off",
	mutate: [
		"src/domain/auto-updates-link.pure.js",
		"src/auth-route-handlers.orch.2.js",
		"src/auth.orch.1.js",
		"src/wiring/default-handler-helpers.orch.2.js",
		"src/wiring/default-handler.orch.1.js",
		"src/wiring/default-handler-routes.orch.2.js",
		"src/wiring/runtime.orch.1.js",
		"src/index.orch.0.js",
	],
	ignorePatterns: [".trash", ".tmp", ".pm", "reports", "Library"],
	reporters: ["clear-text", "progress", "html"],
	thresholds: {
		high: 0,
		low: 0,
		break: 0,
	},
	concurrency: 2,
	timeoutMS: 60000,
	tempDirName: ".stryker-system-tmp",
	cleanTempDir: "always",
};
