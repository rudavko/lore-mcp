/** @implements FR-001, FR-003 — Stable builder for configure-server runtime dependencies. */
import { z } from "zod";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createConfigureLoreServerDbDeps } from "./index-runtime-configure-db-deps.orch.4.js";
import { createConfigureLoreServerDomainDeps } from "./index-runtime-configure-domain-deps.orch.4.js";
import { createConfigureLoreServerMcpDeps } from "./index-runtime-configure-mcp-deps.orch.4.js";

export function createConfigureLoreServerDeps({ runtimeGlobal, std, appVersion }) {
	const {
		issueAutoUpdatesSetupTokenEfct,
		signPayloadBase64Url,
		encodeTokenPayload,
		decodeTokenPayload,
		...domainDeps
	} = createConfigureLoreServerDomainDeps();
	return {
		std,
		appVersion,
		z,
		resourceTemplateCtor: ResourceTemplate,
		...createConfigureLoreServerMcpDeps(),
		logSink: console.log.bind(console),
		nowMs: Date.now,
		random: Math.random,
		...domainDeps,
		...createConfigureLoreServerDbDeps(),
		cryptoLike: runtimeGlobal.crypto,
		textEncoderCtor: runtimeGlobal.TextEncoder,
		textDecoderCtor: runtimeGlobal.TextDecoder,
		uint8ArrayCtor: runtimeGlobal.Uint8Array,
		jsonParse: JSON.parse,
		jsonStringify: JSON.stringify,
		issueAutoUpdatesSetupToken: (targetRepo, expiresAtMs, tokenDeps) =>
			issueAutoUpdatesSetupTokenEfct(targetRepo, expiresAtMs, {
				...tokenDeps,
				signPayloadBase64Url,
				encodeTokenPayload,
				decodeTokenPayload,
			}),
	};
}
