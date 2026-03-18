/** @implements FR-001 — Stable builder for Lore MCP init/process orchestration dependencies. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initSchema } from "./db/schema.efct.js";
import { querySummaryCounts } from "./db/summary.efct.js";
import { formatSummary } from "./db/summary.pure.js";
import { APP_NAME } from "./config.pure.js";
import { RESCHEDULE_DELAY_MS, shouldReschedule } from "./wiring/schedule.pure.js";

export function createInitLoreMcpDeps(input) {
	return {
		std: input.std,
		initSchema,
		querySummaryCounts,
		formatSummary,
		McpServerCtor: McpServer,
		serverName: APP_NAME,
		serverVersion: input.appVersion,
		configureServer: input.configureLoreServer,
	};
}

export function createProcessLoreIngestionDeps(runIngestion) {
	return {
		runIngestion,
		shouldReschedule,
		rescheduleDelayMs: RESCHEDULE_DELAY_MS,
		nowMs: Date.now,
		dateCtor: Date,
	};
}
