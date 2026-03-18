export default {
	testRunner: "command",
	commandRunner: {
		command:
			"bun test src/lib/errors.test.js src/lib/format.test.js src/lib/ulid.test.js src/lib/validity.test.js src/domain/conflict.test.js src/wiring/schedule.test.js src/domain/github-workflow.test.js src/domain/auto-updates-token.test.js src/domain/auto-updates-token-codec.efct.test.js src/domain/auto-updates-link.test.js src/mcp/tools-enable-auto-updates.test.js src/wiring/runtime-configure-server.integration.test.js",
	},
	coverageAnalysis: "off",
	mutate: [
		"src/lib/errors.pure.js",
		"src/lib/format.pure.js",
		"src/lib/ulid.pure.js",
		"src/lib/validity.pure.js",
		"src/domain/conflict.pure.js",
		"src/domain/github-workflow.pure.js",
		"src/domain/auto-updates-token.efct.js",
		"src/domain/auto-updates-token-codec.efct.js",
		"src/domain/auto-updates-link.pure.js",
		"src/wiring/schedule.pure.js",
	],
	ignorePatterns: [".trash", ".tmp", ".pm", "reports", "Library"],
	reporters: ["clear-text", "progress", "html"],
	thresholds: {
		high: 100,
		low: 100,
		break: 100,
	},
	concurrency: 2,
	timeoutMS: 30000,
	tempDirName: ".stryker-tmp",
};
