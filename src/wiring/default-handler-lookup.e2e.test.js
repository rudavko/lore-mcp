/** @implements NFR-006, FR-011 — Verify auth route lookup and session-isolated handler wiring behavior. */
import { expect, test } from "bun:test";
import { registerAuthRoutes } from "../auth.orch.1.js";
import { renderAuthPage } from "../templates/auth-page.pure.js";
import { renderEnrollPasskeyPage } from "../templates/enroll-passkey.pure.js";
import { renderEnrollTotpPage } from "../templates/enroll-totp.pure.js";
import { makeDefaultHandlerFetch } from "./default-handler.orch.1.js";
import {
	createDefaultHandlerDeps,
	createMemoryKv,
	RequestCtor,
} from "./default-handler.test-helpers.js";

function buildHandler() {
	return makeDefaultHandlerFetch(
		createDefaultHandlerDeps({
			routeRegistration: {
				registerAuthRoutes,
			},
			ui: {
				renderAuthPage,
				renderEnrollPasskeyPage,
				renderEnrollTotpPage,
			},
			authState: {
				kvDelete: async (_kv, _key) => {},
			},
		}),
	);
}
test("GET /authorize fails closed when OAuth lookup implementation is unavailable", async () => {
	const handler = buildHandler();
	const kv = createMemoryKv();
	const response = await handler(
		new RequestCtor(
			"http://localhost/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost/callback&scope=read&state=state-1",
		),
		{
			OAUTH_KV: kv,
			ACCESS_PASSPHRASE: "test-pass",
			OAUTH_PROVIDER: {},
		},
	);
	expect(response.status).toBe(500);
	expect(await response.text()).toContain("Internal auth error.");
});
