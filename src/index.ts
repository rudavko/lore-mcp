import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import app from "./auth";
import { initSchema } from "./db/schema";
import { registerTools } from "./mcp/tools";
import { registerResources } from "./mcp/resources";
import { registerPrompts } from "./mcp/prompts";
import { registerSubscriptions, notifyResourceChange } from "./mcp/subscriptions";
import { processIngestionBatch } from "./domain/ingestion";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Lore",
		version: "0.1.0",
	});

	async init() {
		await initSchema(this.env.DB);
		registerTools(this.server, this.env, this.ctx.storage);
		registerResources(this.server, this.env);
		registerPrompts(this.server);
		registerSubscriptions(this.server);

		// Process any pending async ingestion tasks on init
		await this.processIngestion();
	}

	// GEMINI-CONTEXT: The agents framework's schedule() takes `callback: keyof this`
	// and calls the named method directly when the alarm fires. No separate onTask
	// dispatch needed — `this.schedule(when, "processIngestion")` calls
	// `this.processIngestion()` directly. This is the agents framework's API contract
	// per its type: `schedule<T>(when, callback: keyof this, payload?: T)`.
	/** Process pending async ingestion tasks. Reschedules itself if work remains. */
	async processIngestion() {
		const { processed, remaining } = await processIngestionBatch(this.env.DB);
		if (processed > 0) {
			notifyResourceChange(this.server, "entry");
		}
		if (remaining > 0) {
			await this.schedule(new Date(Date.now() + 1000), "processIngestion");
		}
	}
}

export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: MyMCP.serve("/mcp"),
	// @ts-expect-error — Hono app type mismatch with OAuthProvider's expected handler type
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
