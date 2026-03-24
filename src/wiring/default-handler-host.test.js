/** @implements FR-001, FR-011 — Verify default-handler host adapter resolves env and client IP inputs. */
import { describe, expect, test } from "bun:test";
import { createDefaultHandlerHost } from "./default-handler-host.orch.3.js";

describe("wiring/default-handler-host", () => {
	test("maps auth env bindings and Cloudflare client IP into stable host fields", () => {
		const request = new Request("https://lore.example.com/authorize", {
			headers: {
				"CF-Connecting-IP": "10.0.0.1",
			},
		});
		const host = createDefaultHandlerHost(request, {
			OAUTH_KV: { label: "kv" },
			OAUTH_PROVIDER: { label: "oauth" },
			ACCESS_PASSPHRASE: "test-pass",
		});

		expect(host.authKv).toEqual({ label: "kv" });
		expect(host.oauthProvider).toEqual({ label: "oauth" });
		expect(host.accessPassphrase).toBe("test-pass");
		expect(host.clientIp).toBe("10.0.0.1");
	});
});
