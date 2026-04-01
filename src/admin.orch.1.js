/** @implements NFR-001 — Admin route orchestration for install-workflow GET/POST via injected deps. */
const AUTO_UPDATES_USED_PREFIX = "ks:auto_updates_used:";

function usedSetupTokenKey(setupToken) {
	if (typeof setupToken !== "string" || setupToken.length === 0) {
		return AUTO_UPDATES_USED_PREFIX;
	}
	const firstDot = setupToken.indexOf(".");
	if (
		firstDot > 0 &&
		firstDot < setupToken.length - 1 &&
		setupToken.indexOf(".", firstDot + 1) === -1
	) {
		return AUTO_UPDATES_USED_PREFIX + "sig:" + setupToken.slice(firstDot + 1);
	}
	return AUTO_UPDATES_USED_PREFIX + "raw:" + setupToken;
}

function normalizeUsedTokenTtlSeconds(ttlSeconds) {
	if (
		typeof ttlSeconds !== "number" ||
		ttlSeconds !== ttlSeconds ||
		ttlSeconds === Infinity ||
		ttlSeconds === -Infinity ||
		ttlSeconds <= 0
	) {
		return 60;
	}
	if (ttlSeconds < 60) {
		return 60;
	}
	const whole = ttlSeconds - (ttlSeconds % 1);
	return ttlSeconds === whole ? ttlSeconds : whole + 1;
}
function computeSetupInvalidationTtlSeconds(expiresAtMs, nowMsValue) {
	const remainingMs = typeof expiresAtMs === "number" ? expiresAtMs - nowMsValue : 0;
	if (remainingMs <= 0) {
		return 60;
	}
	const ttlBase = remainingMs / 1000;
	const ttlWhole = ttlBase - (ttlBase % 1);
	if (ttlBase === ttlWhole) {
		return ttlWhole;
	}
	return ttlWhole + 1;
}

function errorMessage(error) {
	if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
		return error.message;
	}
	if (typeof error === "string" && error.length > 0) {
		return error;
	}
	return "Unknown admin install error";
}

// CONTEXT: All HTTP framework interactions (cookies, body parsing, responses) are
// abstracted behind the deps parameter. The entry-point index.orch.0.js constructs
// concrete implementations using Hono. This allows testing without the Hono runtime.
/** Register admin routes on the given router. */
export function registerAdminRoutes(router, deps) {
	const kvGet = deps.kvGet;
	const kvPut = deps.kvPut;
	const setCookie = deps.setCookie;
	const getCookie = deps.getCookie;
	const randomToken = deps.randomToken;
	const safeStringEqual = deps.safeStringEqual;
	const bodyString = deps.bodyString;
	const isIpLocked = deps.isIpLocked;
	const clearAuthFailures = deps.clearAuthFailures;
	const installWorkflowToRepo = deps.installWorkflowToRepo;
	const normalizeRepoFullName = deps.normalizeRepoFullName;
	const renderInstallWorkflowPage = deps.renderInstallWorkflowPage;
	const readAutoUpdatesSetupToken = deps.readAutoUpdatesSetupToken;
	const parseBody = deps.parseBody;
	const queryParam = deps.queryParam;
	const htmlResponse = deps.htmlResponse;
	const textResponse = deps.textResponse;
	const nowMs = deps.nowMs;
	function issueAdminCsrfToken() {
		const csrfToken = randomToken();
		setCookie("ks_admin_csrf", csrfToken);
		return csrfToken;
	}
	function renderInstallPage(params) {
		return htmlResponse(renderInstallWorkflowPage(params));
	}
	async function readInstallForm() {
		const body = await parseBody();
		return {
			setupToken: bodyString(body.setup_token),
			githubPat: bodyString(body.github_pat),
			csrfBody: bodyString(body.csrf_token),
		};
	}
	async function loadSetupLink(setupToken) {
		if (!setupToken) {
			return null;
		}
		const signed = await readAutoUpdatesSetupToken(setupToken);
		if (signed === null) {
			return null;
		}
		return {
			targetRepo: signed.targetRepo,
			expiresAtMs: signed.expiresAtMs,
		};
	}
	async function isSetupLinkConsumed(setupToken) {
		return (await kvGet(usedSetupTokenKey(setupToken))) !== null;
	}
	async function renderInstallError(setupToken, defaultRepo, error) {
		const csrfToken = issueAdminCsrfToken();
		return renderInstallPage({
			setupToken,
			csrfToken,
			defaultRepo,
			error,
		});
	}
	async function hasValidCsrf(csrfBody) {
		const csrfCookie = getCookie("ks_admin_csrf");
		if (!csrfBody || !csrfCookie) {
			return false;
		}
		return await safeStringEqual(csrfBody, csrfCookie);
	}
	function normalizeTargetRepo(targetRepo) {
		const normalized = normalizeRepoFullName(targetRepo);
		if (!normalized || normalized.length === 0) {
			return "";
		}
		return normalized;
	}
	async function callInstallWorkflowToRepo(githubPat, normalizedRepo) {
		try {
			return { ok: true, value: await installWorkflowToRepo(githubPat, normalizedRepo) };
		} catch (error) {
			return { ok: false, error: "installWorkflowToRepo: " + errorMessage(error) };
		}
	}
	function renderUnexpectedInstallError(message) {
		return textResponse("Unexpected admin install error: " + message, 500);
	}
	function issueAdminCsrfTokenResult() {
		try {
			return { ok: true, value: issueAdminCsrfToken() };
		} catch (error) {
			return { ok: false, error: "issueAdminCsrfToken: " + errorMessage(error) };
		}
	}
	function renderInstallPageResult(params) {
		try {
			return { ok: true, value: renderInstallPage(params) };
		} catch (error) {
			return { ok: false, error: "renderInstallPage: " + errorMessage(error) };
		}
	}
	async function handleInstallWorkflowGet() {
		const setupToken = bodyString(queryParam("setup_token"));
		try {
			const setup = await loadSetupLink(setupToken);
			if (setup === null || (await isSetupLinkConsumed(setupToken))) {
				return textResponse("Invalid or expired setup link", 401);
			}
			const csrfToken = issueAdminCsrfToken();
			return renderInstallPage({ setupToken, csrfToken, defaultRepo: setup.targetRepo });
		} catch (error) {
			return textResponse("Unexpected admin install error: " + errorMessage(error), 500);
		}
	}
	async function guardInstallWorkflowPostAccess() {
		if (await isIpLocked()) {
			return textResponse("Too many failed attempts. Please try again later.", 429);
		}
		return null;
	}
	async function parseAndValidateInstallForm() {
		const form = await readInstallForm();
		if (!(await hasValidCsrf(form.csrfBody))) {
			return { form: null, failure: textResponse("Invalid request", 400) };
		}
		return {
			form: {
				setupToken: form.setupToken,
				githubPat: form.githubPat,
			},
			failure: null,
		};
	}
	async function loadActiveSetupOrUnauthorized(setupToken) {
		const setup = await loadSetupLink(setupToken);
		if (setup === null || (await isSetupLinkConsumed(setupToken))) {
			return { setup: null, response: textResponse("Invalid or expired setup link", 401) };
		}
		return { setup, response: null };
	}
	async function invalidateSuccessfulInstallSetup(setup, setupToken) {
		if (!setup) {
			return "";
		}
		try {
			const ttlSeconds = computeSetupInvalidationTtlSeconds(setup.expiresAtMs, nowMs());
			await kvPut(usedSetupTokenKey(setupToken), "1", normalizeUsedTokenTtlSeconds(ttlSeconds));
			return "";
		} catch {
			return "Workflow installed, but the one-time setup link could not be invalidated. It will expire shortly.";
		}
	}
	function buildInstallRenderParams({ result, warning, setupToken, csrfToken, normalizedRepo }) {
		const installSucceeded = Boolean(result && result.ok);
		const responseResult = warning && installSucceeded ? { ...result, warning } : result;
		return {
			setupToken: installSucceeded ? "" : setupToken,
			csrfToken: installSucceeded ? "" : csrfToken,
			defaultRepo: normalizedRepo,
			result: responseResult,
		};
	}
	async function executeInstallWorkflow(setupToken, githubPat) {
		const setupState = await loadActiveSetupOrUnauthorized(setupToken);
		if (setupState.response !== null || setupState.setup === null) {
			return setupState.response;
		}
		await clearAuthFailures();
		const setup = setupState.setup;
		const normalizedRepo = normalizeTargetRepo(setup.targetRepo);
		if (!normalizedRepo) {
			return await renderInstallError(
				setupToken,
				setup.targetRepo,
				"Invalid repository format. Expected: owner/repo",
			);
		}
		const installCall = await callInstallWorkflowToRepo(githubPat, normalizedRepo);
		if (!installCall.ok) {
			return renderUnexpectedInstallError(installCall.error);
		}
		const result = installCall.value;
		const warning = result && result.ok ? await invalidateSuccessfulInstallSetup(setup, setupToken) : "";
		const csrfToken = issueAdminCsrfTokenResult();
		if (!csrfToken.ok) {
			return renderUnexpectedInstallError(csrfToken.error);
		}
		const rendered = renderInstallPageResult(
			buildInstallRenderParams({
				result,
				warning,
				setupToken,
				csrfToken: csrfToken.value,
				normalizedRepo,
			}),
		);
		if (!rendered.ok) {
			return renderUnexpectedInstallError(rendered.error);
		}
		return rendered.value;
	}
	async function handleInstallWorkflowPost() {
		try {
			const accessFailure = await guardInstallWorkflowPostAccess();
			if (accessFailure !== null) {
				return accessFailure;
			}
			const parsed = await parseAndValidateInstallForm();
			if (parsed.failure !== null || parsed.form === null) {
				return parsed.failure;
			}
			return await executeInstallWorkflow(
				parsed.form.setupToken,
				parsed.form.githubPat,
			);
		} catch (error) {
			return textResponse("Unexpected admin install error: " + errorMessage(error), 500);
		}
	}
	/* GET /install-workflow */
	router.get("/install-workflow", handleInstallWorkflowGet);
	/* POST /install-workflow */
	router.post("/install-workflow", handleInstallWorkflowPost);
}
