import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode-svg";
import { verifyCfAccessJwt } from "./cf-access";
import { renderAuthPage } from "./templates/authorize";
import { renderEnrollPasskeyPage } from "./templates/enroll-passkey";
import { renderEnrollTotpPage } from "./templates/enroll-totp";
import { generateSecret, verifyTOTP, buildOtpAuthUri } from "./totp";
import {
	getCredential,
	storeCredential,
	updateCredentialCounter,
	createRegistrationOptions,
	verifyRegistration,
	createAuthenticationOptions,
	verifyAuthentication,
	storeChallenge,
	consumeChallenge,
} from "./webauthn";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

// GEMINI-CONTEXT: The auth flow supports three second-factor modes: passkey (preferred),
// TOTP (fallback), or first-time enrollment. POST /approve checks which factors are
// enrolled and provided, then either completes OAuth or redirects to enrollment.
// The WebAuthn challenge is stored in the same KV entry as the OAuth request (extended
// format: { oauthReq, webauthnChallenge? }). For enrollment, a separate KV entry under
// ks:passkey:challenge:{nonce} stores the registration challenge and OAuth request.
// Dynamic CSP: routes that need inline JS set c.set("cspNonce", nonce), and the
// middleware appends script-src 'nonce-{nonce}' to the CSP header.

type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
	ACCESS_PASSPHRASE?: string;
	OWNER_EMAIL?: string;
	CF_ACCESS_TEAM_DOMAIN?: string;
	CF_ACCESS_AUD?: string;
};

type Variables = {
	cspNonce?: string;
};

const AUTH_REQUEST_TTL_SECONDS = 10 * 60;
const FAIL_WINDOW_TTL_SECONDS = 15 * 60;
const LOCKOUT_TTL_SECONDS = 15 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const CSRF_COOKIE_NAME = "ks_csrf";
const AUTH_REQ_PREFIX = "ks:authreq:";
const FAIL_PREFIX = "ks:authfail:";
const LOCK_PREFIX = "ks:authlock:";

const TOTP_SECRET_KEY = "ks:totp:secret";
const TOTP_PENDING_PREFIX = "ks:totp:pending:";
const TOTP_PENDING_TTL_SECONDS = 10 * 60;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function randomToken(bytes: number = 24): string {
	const token = new Uint8Array(bytes);
	crypto.getRandomValues(token);
	return Array.from(token, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<Uint8Array> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return new Uint8Array(digest);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let diff = 0;
	for (let index = 0; index < left.length; index++) {
		diff |= left[index] ^ right[index];
	}
	return diff === 0;
}

async function safeStringEqual(left: string, right: string): Promise<boolean> {
	const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
	return timingSafeEqual(leftHash, rightHash);
}

function bodyString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function failKey(ip: string): string {
	return `${FAIL_PREFIX}${ip}`;
}

function lockKey(ip: string): string {
	return `${LOCK_PREFIX}${ip}`;
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
	return c.req.header("CF-Connecting-IP") ?? "unknown";
}

async function isIpLocked(c: { env: Bindings }, ip: string): Promise<boolean> {
	return (await c.env.OAUTH_KV.get(lockKey(ip))) !== null;
}

async function registerAuthFailure(c: { env: Bindings }, ip: string): Promise<void> {
	const key = failKey(ip);
	const existingRaw = await c.env.OAUTH_KV.get(key);
	const existing = Number.parseInt(existingRaw ?? "0", 10);
	const next = Number.isNaN(existing) ? 1 : existing + 1;

	await c.env.OAUTH_KV.put(key, String(next), { expirationTtl: FAIL_WINDOW_TTL_SECONDS });

	if (next >= MAX_FAILED_ATTEMPTS) {
		await Promise.all([
			c.env.OAUTH_KV.put(lockKey(ip), "1", { expirationTtl: LOCKOUT_TTL_SECONDS }),
			c.env.OAUTH_KV.delete(key),
		]);
	}
}

async function clearAuthFailures(c: { env: Bindings }, ip: string): Promise<void> {
	await Promise.all([
		c.env.OAUTH_KV.delete(failKey(ip)),
		c.env.OAUTH_KV.delete(lockKey(ip)),
	]);
}

// GEMINI-CONTEXT: enforceOwnerEmail verifies the CF Access JWT signature and extracts
// email from the verified payload. The spoofable Cf-Access-Authenticated-User-Email
// header is intentionally ignored. Opt-in: returns null when env vars are absent.
async function enforceOwnerEmail(c: { env: Bindings; req: { header: (name: string) => string | undefined } }): Promise<Response | null> {
	const teamDomain = (c.env.CF_ACCESS_TEAM_DOMAIN ?? "").trim();
	const expectedAud = (c.env.CF_ACCESS_AUD ?? "").trim();

	if (!teamDomain || !expectedAud) {
		return null; // CF Access not configured — passphrase-only
	}

	const token = c.req.header("Cf-Access-Jwt-Assertion") ?? "";
	if (!token) {
		return new Response("Forbidden", { status: 403 });
	}

	const result = await verifyCfAccessJwt(token, teamDomain, expectedAud, c.env.OAUTH_KV);

	if (!result.valid) {
		if (result.reason === "jwk_fetch_failed") {
			return new Response("Service Unavailable", { status: 503 });
		}
		return new Response("Forbidden", { status: 403 });
	}

	const ownerEmail = (c.env.OWNER_EMAIL ?? "").trim().toLowerCase();
	if (ownerEmail && result.email.toLowerCase() !== ownerEmail) {
		return new Response("Forbidden", { status: 403 });
	}

	return null;
}

function requiredPassphrase(env: Bindings): string | null {
	const value = (env.ACCESS_PASSPHRASE ?? "").trim();
	return value.length > 0 ? value : null;
}

/** Format base32 secret in 4-char groups for display. */
function formatSecretForDisplay(secret: string): string {
	return secret.replace(/(.{4})/g, "$1 ").trim();
}

async function completeOAuth(c: { env: Bindings }, oauthReqInfo: AuthRequest) {
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: "owner",
		metadata: { label: "Owner" },
		scope: oauthReqInfo.scope,
		props: { role: "owner" },
	});
	return redirectTo;
}

/** Stored auth request format — extended to include WebAuthn challenge when passkey is enrolled. */
interface StoredAuthReq {
	oauthReq: AuthRequest;
	webauthnChallenge?: string;
}

function parseStoredAuthReq(raw: string): StoredAuthReq | null {
	try {
		const parsed = JSON.parse(raw);
		// Support both old format (raw AuthRequest) and new format ({ oauthReq, webauthnChallenge })
		if (parsed.oauthReq) return parsed as StoredAuthReq;
		return { oauthReq: parsed as AuthRequest };
	} catch {
		return null;
	}
}

// ── Security Headers Middleware ─────────────────────────────────────

app.use("*", async (c, next) => {
	await next();

	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Referrer-Policy", "no-referrer");
	c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

	const nonce = c.get("cspNonce");
	const scriptSrc = nonce ? ` script-src 'nonce-${nonce}';` : "";
	c.header(
		"Content-Security-Policy",
		`default-src 'none'; style-src 'unsafe-inline'; img-src 'self';${scriptSrc} manifest-src 'self'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'none'`,
	);

	const noStorePaths = ["/authorize", "/approve", "/enroll-totp", "/enroll-passkey", "/complete-passkey-skip", "/enroll-totp-redirect"];
	if (noStorePaths.includes(c.req.path)) {
		c.header("Cache-Control", "no-store");
	}
});

app.get("/", (c) =>
	c.text("Knowledge Server MCP is running. Connect via /mcp"),
);

// ── GET /authorize ──────────────────────────────────────────────────

app.get("/authorize", async (c) => {
	if (!requiredPassphrase(c.env)) {
		return c.text("Server misconfigured: ACCESS_PASSPHRASE is required.", 500);
	}

	const ownerEmailDenied = await enforceOwnerEmail(c);
	if (ownerEmailDenied) {
		return ownerEmailDenied;
	}

	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const requestNonce = randomToken();
	const csrfToken = randomToken();

	const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
	const clientName = clientInfo?.clientName ?? oauthReqInfo.clientId;
	const clientUri = clientInfo?.clientUri ?? "";
	const scopes = oauthReqInfo.scope.length > 0 ? oauthReqInfo.scope.join(", ") : "full access";

	const [passkeyCredential, totpSecret] = await Promise.all([
		getCredential(c.env.OAUTH_KV),
		c.env.OAUTH_KV.get(TOTP_SECRET_KEY),
	]);
	const totpEnrolled = totpSecret !== null;
	const passkeyEnrolled = passkeyCredential !== null;

	const url = new URL(c.req.url);
	const fallbackRequested = url.searchParams.has("fallback");
	const passkeyOnly = passkeyEnrolled && !fallbackRequested;

	const stored: StoredAuthReq = { oauthReq: oauthReqInfo };
	let authOptionsJSON: string | undefined;
	let cspNonce: string | undefined;
	let fallbackUrl: string | undefined;

	if (passkeyOnly) {
		const authOptions = await createAuthenticationOptions(url.hostname, passkeyCredential);
		stored.webauthnChallenge = authOptions.challenge;
		authOptionsJSON = JSON.stringify(authOptions);
		cspNonce = randomToken(16);
		c.set("cspNonce", cspNonce);

		if (totpEnrolled) {
			const fbUrl = new URL(url);
			fbUrl.searchParams.set("fallback", "1");
			fallbackUrl = fbUrl.pathname + "?" + fbUrl.searchParams.toString();
		}
	}

	await c.env.OAUTH_KV.put(
		`${AUTH_REQ_PREFIX}${requestNonce}`,
		JSON.stringify(stored),
		{ expirationTtl: AUTH_REQUEST_TTL_SECONDS },
	);

	setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: AUTH_REQUEST_TTL_SECONDS,
	});

	return c.html(renderAuthPage({
		requestNonce,
		csrfToken,
		clientName,
		clientUri,
		scopes,
		totpEnrolled,
		passkeyEnrolled: passkeyOnly ? true : false,
		passkeyOnly,
		fallbackUrl,
		authOptionsJSON,
		cspNonce,
	}));
});

// ── POST /approve ───────────────────────────────────────────────────

app.post("/approve", async (c) => {
	const expectedPassphrase = requiredPassphrase(c.env);
	if (!expectedPassphrase) {
		return c.text("Server misconfigured: ACCESS_PASSPHRASE is required.", 500);
	}

	const ownerEmailDenied = await enforceOwnerEmail(c);
	if (ownerEmailDenied) {
		return ownerEmailDenied;
	}

	const ip = getClientIp(c);
	if (await isIpLocked(c, ip)) {
		return c.text("Too many failed attempts. Please try again later.", 429);
	}

	const body = await c.req.parseBody();
	const passphrase = bodyString(body.passphrase);
	const requestNonce = bodyString(body.request_nonce);
	const csrfBody = bodyString(body.csrf_token);
	const csrfCookie = getCookie(c, CSRF_COOKIE_NAME) ?? "";

	if (!requestNonce || !csrfBody || !csrfCookie || !(await safeStringEqual(csrfBody, csrfCookie))) {
		return c.text("Invalid authorization request", 400);
	}

	const oauthReqRaw = await c.env.OAUTH_KV.get(`${AUTH_REQ_PREFIX}${requestNonce}`);
	await c.env.OAUTH_KV.delete(`${AUTH_REQ_PREFIX}${requestNonce}`);
	deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });

	if (!oauthReqRaw) {
		return c.text("Authorization request expired. Retry authorization.", 400);
	}

	const stored = parseStoredAuthReq(oauthReqRaw);
	if (!stored) {
		return c.text("Invalid request", 400);
	}
	const oauthReqInfo = stored.oauthReq;

	// GEMINI-CONTEXT: Passkey-only branch runs BEFORE passphrase check. When the passkeyOnly
	// page auto-triggers WebAuthn, the form has no passphrase field — so we skip the passphrase
	// comparison entirely. The webauthnChallenge in the stored auth req is only present when the
	// GET /authorize handler rendered the passkeyOnly page (passkey enrolled, no ?fallback=1).
	// If this branch doesn't match, we fall through to the passphrase-based flow unchanged.
	const webauthnResponseRaw = bodyString(body.webauthn_response);
	if (webauthnResponseRaw && stored.webauthnChallenge) {
		const kv = c.env.OAUTH_KV;
		const passkeyCredential = await getCredential(kv);
		if (!passkeyCredential) {
			await registerAuthFailure(c, ip);
			return c.text("Authorization failed", 403);
		}

		let parsed: AuthenticationResponseJSON;
		try {
			parsed = JSON.parse(webauthnResponseRaw);
		} catch {
			await registerAuthFailure(c, ip);
			return c.text("Authorization failed", 403);
		}

		const url = new URL(c.req.url);
		const result = await verifyAuthentication(
			parsed,
			stored.webauthnChallenge,
			url.origin,
			url.hostname,
			passkeyCredential,
		);

		if (!result.verified) {
			await registerAuthFailure(c, ip);
			return c.text("Authorization failed", 403);
		}

		await updateCredentialCounter(kv, result.newCounter);
		await clearAuthFailures(c, ip);
		return c.redirect(await completeOAuth(c, oauthReqInfo), 302);
	}

	// ── Passphrase-based flow (fallback page or no passkey enrolled) ─
	if (!(await safeStringEqual(passphrase, expectedPassphrase))) {
		await registerAuthFailure(c, ip);
		return c.text("Authorization failed", 403);
	}

	// ── Second-factor verification ──────────────────────────────────
	const kv = c.env.OAUTH_KV;
	const [passkeyCredential, enrolledTotpSecret] = await Promise.all([
		getCredential(kv),
		kv.get(TOTP_SECRET_KEY),
	]);
	const totpCode = bodyString(body.totp_code);

	// Branch 1: TOTP code provided + TOTP enrolled
	if (totpCode && enrolledTotpSecret) {
		if (!(await verifyTOTP(enrolledTotpSecret, totpCode))) {
			await registerAuthFailure(c, ip);
			return c.text("Authorization failed", 403);
		}

		await clearAuthFailures(c, ip);

		// Offer passkey enrollment if not yet enrolled
		if (!passkeyCredential) {
			return startPasskeyEnrollment(c, oauthReqInfo, true);
		}

		return c.redirect(await completeOAuth(c, oauthReqInfo), 302);
	}

	// Branch 2: No second factor enrolled → first-time setup
	if (!enrolledTotpSecret && !passkeyCredential) {
		await clearAuthFailures(c, ip);
		return startPasskeyEnrollment(c, oauthReqInfo, false);
	}

	// Branch 3: Second factor enrolled but not provided (JS disabled, passkey cancelled, etc.)
	await registerAuthFailure(c, ip);
	return c.text("Authorization failed", 403);
});

// ── Passkey Enrollment Helper ───────────────────────────────────────

async function startPasskeyEnrollment(
	c: Context<{ Bindings: Bindings; Variables: Variables }>,
	oauthReq: AuthRequest,
	totpEnrolled: boolean,
): Promise<Response> {
	const kv = c.env.OAUTH_KV;
	const url = new URL(c.req.url);
	const existingCred = await getCredential(kv);
	const regOptions = await createRegistrationOptions(url.hostname, "Lore", existingCred);

	const enrollNonce = randomToken();
	const csrfToken = randomToken();
	const cspNonce = randomToken(16);

	await storeChallenge(kv, enrollNonce, regOptions.challenge, oauthReq, "registration");

	setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: TOTP_PENDING_TTL_SECONDS,
	});

	c.set("cspNonce", cspNonce);

	return c.html(renderEnrollPasskeyPage({
		enrollNonce,
		csrfToken,
		optionsJSON: JSON.stringify(regOptions),
		cspNonce,
		totpEnrolled,
	}));
}

// ── POST /enroll-passkey ────────────────────────────────────────────

app.post("/enroll-passkey", async (c) => {
	const ip = getClientIp(c);
	if (await isIpLocked(c, ip)) {
		return c.text("Too many failed attempts. Please try again later.", 429);
	}

	const body = await c.req.parseBody();
	const enrollNonce = bodyString(body.enroll_nonce);
	const registrationResponseRaw = bodyString(body.registration_response);
	const csrfBody = bodyString(body.csrf_token);
	const csrfCookie = getCookie(c, CSRF_COOKIE_NAME) ?? "";

	if (!enrollNonce || !csrfBody || !csrfCookie || !(await safeStringEqual(csrfBody, csrfCookie))) {
		return c.text("Invalid enrollment request", 400);
	}

	const challenge = await consumeChallenge(c.env.OAUTH_KV, enrollNonce);
	deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });

	if (!challenge || challenge.type !== "registration") {
		return c.text("Enrollment expired. Please start over.", 400);
	}

	let response: RegistrationResponseJSON;
	try {
		response = JSON.parse(registrationResponseRaw);
	} catch {
		await registerAuthFailure(c, ip);
		return c.text("Invalid registration data", 400);
	}

	const url = new URL(c.req.url);
	const credential = await verifyRegistration(
		response,
		challenge.challenge,
		url.origin,
		url.hostname,
	);

	if (!credential) {
		await registerAuthFailure(c, ip);
		return c.text("Passkey registration failed. Please start over.", 403);
	}

	await storeCredential(c.env.OAUTH_KV, credential);
	await clearAuthFailures(c, ip);

	return c.redirect(await completeOAuth(c, challenge.oauthReq), 302);
});

// ── GET /complete-passkey-skip ──────────────────────────────────────

app.get("/complete-passkey-skip", async (c) => {
	const nonce = c.req.query("nonce") ?? "";
	const csrfParam = c.req.query("csrf") ?? "";
	const csrfCookie = getCookie(c, CSRF_COOKIE_NAME) ?? "";

	if (!nonce || !csrfParam || !csrfCookie || !(await safeStringEqual(csrfParam, csrfCookie))) {
		return c.text("Invalid request", 400);
	}

	const challenge = await consumeChallenge(c.env.OAUTH_KV, nonce);
	deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });

	if (!challenge) {
		return c.text("Session expired. Please start over.", 400);
	}

	return c.redirect(await completeOAuth(c, challenge.oauthReq), 302);
});

// ── GET /enroll-totp-redirect ───────────────────────────────────────
// User chose TOTP instead of passkey during first-time enrollment.

app.get("/enroll-totp-redirect", async (c) => {
	const nonce = c.req.query("nonce") ?? "";
	const csrfParam = c.req.query("csrf") ?? "";
	const csrfCookie = getCookie(c, CSRF_COOKIE_NAME) ?? "";

	if (!nonce || !csrfParam || !csrfCookie || !(await safeStringEqual(csrfParam, csrfCookie))) {
		return c.text("Invalid request", 400);
	}

	const challenge = await consumeChallenge(c.env.OAUTH_KV, nonce);
	deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });

	if (!challenge) {
		return c.text("Session expired. Please start over.", 400);
	}

	// Start TOTP enrollment (same as the flow in POST /approve when no TOTP enrolled)
	const pendingSecret = generateSecret();
	const enrollNonce = randomToken();
	const csrfToken = randomToken();

	await c.env.OAUTH_KV.put(
		`${TOTP_PENDING_PREFIX}${enrollNonce}`,
		JSON.stringify({ secret: pendingSecret, oauthReq: challenge.oauthReq }),
		{ expirationTtl: TOTP_PENDING_TTL_SECONDS },
	);

	setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: TOTP_PENDING_TTL_SECONDS,
	});

	const uri = buildOtpAuthUri({ secret: pendingSecret });
	const qr = new QRCode({
		content: uri,
		padding: 0,
		width: 200,
		height: 200,
		color: "#000000",
		background: "#ffffff",
		ecl: "M",
		join: true,
		container: "svg",
	});

	return c.html(renderEnrollTotpPage({
		qrSvg: qr.svg(),
		secretDisplay: formatSecretForDisplay(pendingSecret),
		enrollNonce,
		csrfToken,
	}));
});

// ── POST /enroll-totp ───────────────────────────────────────────────

app.post("/enroll-totp", async (c) => {
	const ip = getClientIp(c);
	if (await isIpLocked(c, ip)) {
		return c.text("Too many failed attempts. Please try again later.", 429);
	}

	const body = await c.req.parseBody();
	const enrollNonce = bodyString(body.enroll_nonce);
	const totpCode = bodyString(body.totp_code);
	const csrfBody = bodyString(body.csrf_token);
	const csrfCookie = getCookie(c, CSRF_COOKIE_NAME) ?? "";

	if (!enrollNonce || !csrfBody || !csrfCookie || !(await safeStringEqual(csrfBody, csrfCookie))) {
		return c.text("Invalid enrollment request", 400);
	}

	// Single-use: read and delete
	const pendingKey = `${TOTP_PENDING_PREFIX}${enrollNonce}`;
	const pendingRaw = await c.env.OAUTH_KV.get(pendingKey);
	await c.env.OAUTH_KV.delete(pendingKey);
	deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });

	if (!pendingRaw) {
		return c.text("Enrollment expired. Please start over.", 400);
	}

	let pending: { secret: string; oauthReq: AuthRequest };
	try {
		pending = JSON.parse(pendingRaw);
	} catch {
		return c.text("Invalid enrollment state", 400);
	}

	if (!(await verifyTOTP(pending.secret, totpCode))) {
		await registerAuthFailure(c, ip);
		return c.text("Invalid verification code. Please start over.", 403);
	}

	// Persist TOTP secret permanently
	await c.env.OAUTH_KV.put(TOTP_SECRET_KEY, pending.secret);
	await clearAuthFailures(c, ip);

	return c.redirect(await completeOAuth(c, pending.oauthReq), 302);
});

export default app;
