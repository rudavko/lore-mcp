/** @implements FR-020 — Verify enable_auto_updates tool registration and handler behavior. */
import { describe, expect, test } from "bun:test";
import { handleEnableAutoUpdates } from "./tools-system.efct.js";
import { withEnableAutoUpdatesDeps } from "./tools-handler.test-helpers.js";
const AUTO_UPDATES_LINK_TTL_SECONDS = 15 * 60;
const encodeSetupToken = globalThis.encodeURIComponent;

function buildEnableAutoUpdatesPath(setupToken) {
	return "/admin/install-workflow?setup_token=" + encodeSetupToken(setupToken);
}

function buildEnableAutoUpdatesUrl(baseUrl, setupToken) {
	if (typeof baseUrl !== "string") {
		return null;
	}
	const trimmed = baseUrl.trim();
	if (trimmed.length === 0) {
		return null;
	}
	const normalizedBase = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
	if (!/^https?:\/\//u.test(normalizedBase)) {
		return null;
	}
	return normalizedBase + buildEnableAutoUpdatesPath(setupToken);
}

describe("mcp/tools enable_auto_updates", () => {
	test("creates a short-lived one-time browser link", async () => {
		const result = await handleEnableAutoUpdates(
			{},
			withEnableAutoUpdatesDeps({
				std: { Date },
				autoUpdatesLinkTtlSeconds: AUTO_UPDATES_LINK_TTL_SECONDS,
				buildEnableAutoUpdatesPath,
				buildEnableAutoUpdatesUrl,
				resolveAutoUpdatesInstallContext: async () => ({
					mode: "workers_build_ref",
					branch: "main",
					commitSha: "abc123",
				}),
				issueAutoUpdatesSetupToken: async (targetRepo, expiresAtMs) => {
					expect(targetRepo).toEqual({
						mode: "workers_build_ref",
						branch: "main",
						commitSha: "abc123",
					});
					expect(typeof expiresAtMs).toBe("number");
					return "setup-token-1";
				},
				resolveEnableAutoUpdatesBaseUrl: () => "https://example.com",
				requestHeaders: undefined,
				logEvent: () => {},
				formatResult: (text, data) => ({ text, ...data }),
			}),
		);
		expect(result.url).toBe(
			"https://example.com/admin/install-workflow?setup_token=setup-token-1",
		);
		expect(result.path).toBe("/admin/install-workflow?setup_token=setup-token-1");
		expect(result.text).toContain(
			"URL: https://example.com/admin/install-workflow?setup_token=setup-token-1",
		);
		expect(result.text).toContain(
			"Target repo verification: use a fine-grained GitHub PAT scoped to exactly one deploy repo.",
		);
		expect(result.target_repo).toBeNull();
		expect(result.expires_in_seconds).toBe(AUTO_UPDATES_LINK_TTL_SECONDS);
		expect(typeof result.expires_at).toBe("string");
	});

	test("includes the relative path in visible text when no absolute base URL is available", async () => {
		const result = await handleEnableAutoUpdates(
			{},
			withEnableAutoUpdatesDeps({
				std: { Date },
				autoUpdatesLinkTtlSeconds: AUTO_UPDATES_LINK_TTL_SECONDS,
				buildEnableAutoUpdatesPath,
				buildEnableAutoUpdatesUrl,
				resolveAutoUpdatesInstallContext: async () => ({
					mode: "workers_build_ref",
					branch: "main",
					commitSha: "abc123",
				}),
				issueAutoUpdatesSetupToken: async () => "setup-token-2",
				resolveEnableAutoUpdatesBaseUrl: () => "",
				requestHeaders: undefined,
				logEvent: () => {},
				formatResult: (text, data) => ({ text, ...data }),
			}),
		);
		expect(result.url).toBeNull();
		expect(result.path).toBe("/admin/install-workflow?setup_token=setup-token-2");
		expect(result.text).toContain(
			"Target repo verification: use a fine-grained GitHub PAT scoped to exactly one deploy repo.",
		);
		expect(result.text).toContain(
			"Path: /admin/install-workflow?setup_token=setup-token-2",
		);
	});

	test("derives the absolute URL from request headers when no public base URL override exists", async () => {
		const requestHeaders = {
			host: "lore.example.com",
			"x-forwarded-proto": "https",
		};
		const result = await handleEnableAutoUpdates(
			{},
			withEnableAutoUpdatesDeps({
				std: { Date },
				autoUpdatesLinkTtlSeconds: AUTO_UPDATES_LINK_TTL_SECONDS,
				buildEnableAutoUpdatesPath,
				buildEnableAutoUpdatesUrl,
				resolveAutoUpdatesInstallContext: async () => ({
					mode: "workers_build_ref",
					branch: "main",
					commitSha: "abc123",
				}),
				issueAutoUpdatesSetupToken: async () => "setup-token-3",
				resolveEnableAutoUpdatesBaseUrl: (headers) => {
					expect(headers).toBe(requestHeaders);
					return "https://lore.example.com";
				},
				requestHeaders,
				logEvent: () => {},
				formatResult: (text, data) => ({ text, ...data }),
			}),
		);
		expect(result.url).toBe(
			"https://lore.example.com/admin/install-workflow?setup_token=setup-token-3",
		);
		expect(result.text).toContain(
			"URL: https://lore.example.com/admin/install-workflow?setup_token=setup-token-3",
		);
	});
});
