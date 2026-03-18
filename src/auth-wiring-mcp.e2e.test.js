/** @implements FR-011 — Exported-worker OAuth and MCP surface E2E checks. */
import { describe, expect, test } from "bun:test";
import {
	ACCESS_PASSPHRASE,
	createCtx,
	createMcpBindingStub,
	createMemoryKv,
	workerFetch,
} from "./auth-wiring-env.test-helpers.js";
import { runOAuthAndReturnAccessToken } from "./auth-wiring-flow.test-helpers.js";

describe("auth wiring mcp e2e", () => {
	test("issued access token can call /mcp without 5xx", async () => {
		const flow = await runOAuthAndReturnAccessToken();
		const response = await workerFetch(flow.env, flow.ctx, "/mcp", {
			method: "POST",
			headers: {
				authorization: `Bearer ${flow.accessToken}`,
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "e2e-mcp-probe",
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "e2e", version: "1.0.0" },
				},
			}),
		});
		expect(response.status >= 500).toBe(false);
	});

	test("OAuth discovery metadata is exposed", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
			MCP_OBJECT: createMcpBindingStub(),
		};
		const response = await workerFetch(env, createCtx(), "/.well-known/oauth-authorization-server");
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("/authorize");
		expect(body).toContain("/token");
	});

	test("unauthenticated initialize on /mcp is rejected", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
			MCP_OBJECT: createMcpBindingStub(),
		};
		const response = await workerFetch(env, createCtx(), "/mcp", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "unauth-init-probe",
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "unauth-test", version: "1.0.0" },
				},
			}),
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain("invalid_token");
	});

	test("unauthenticated SSE probe to /mcp is rejected", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
			MCP_OBJECT: createMcpBindingStub(),
		};
		const response = await workerFetch(env, createCtx(), "/mcp", {
			method: "GET",
			headers: { accept: "text/event-stream" },
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain("invalid_token");
	});

	test("unauthenticated tools/list on /mcp is rejected", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
			MCP_OBJECT: createMcpBindingStub(),
		};
		const response = await workerFetch(env, createCtx(), "/mcp", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "unauth-tools-list-probe",
				method: "tools/list",
			}),
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain("invalid_token");
	});

	test("unauthenticated build_info tool call on /mcp is rejected", async () => {
		const env = {
			OAUTH_KV: createMemoryKv(),
			ACCESS_PASSPHRASE,
			MCP_OBJECT: createMcpBindingStub(),
		};
		const response = await workerFetch(env, createCtx(), "/mcp", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "unauth-build-info-probe",
				method: "tools/call",
				params: { name: "build_info", arguments: {} },
			}),
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain("invalid_token");
	});
});
