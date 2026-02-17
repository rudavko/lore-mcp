#!/usr/bin/env bun
/**
 * Smoke test for the TOTP enrollment flow against a running wrangler dev instance.
 * Usage: npx wrangler dev --port 8799  (in another terminal)
 *        bun run evals/smoke-totp.ts
 */
import { computeTOTP, base32Encode } from "../src/totp";

const BASE = process.env.SERVER_URL ?? "http://localhost:8799";

// Read passphrase from .dev.vars (wrangler dev source) rather than .env (Bun auto-loads .env which may differ)
function readDevVarsPassphrase(): string {
	try {
		const content = require("fs").readFileSync(`${process.cwd()}/.dev.vars`, "utf8");
		const match = content.match(/^ACCESS_PASSPHRASE=(.+)$/m);
		if (match) return match[1].trim();
	} catch { /* ignore */ }
	return "";
}
const PASSPHRASE = process.env.SERVER_URL
	? (process.env.ACCESS_PASSPHRASE ?? "")
	: readDevVarsPassphrase();

function extractValue(html: string, name: string): string {
	const re = new RegExp(`name="${name}"\\s+value="([^"]+)"`);
	const match = html.match(re);
	if (!match) throw new Error(`Could not find hidden field "${name}" in HTML`);
	return match[1];
}

function extractCookie(res: Response, name: string): string {
	const setCookies: string[] = res.headers.getSetCookie?.() ?? [];
	// Use the last matching Set-Cookie header (earlier ones may be delete/clear headers)
	let result: string | null = null;
	for (const sc of setCookies) {
		const trimmed = sc.trim();
		if (trimmed.startsWith(`${name}=`)) {
			const value = trimmed.split("=")[1].split(";")[0];
			if (value) result = value;
		}
	}
	if (result) return result;
	throw new Error(`Cookie "${name}" not found.\nSet-Cookie: ${JSON.stringify(setCookies)}`);
}

async function main() {
	console.log("=== TOTP Enrollment Smoke Test ===\n");

	// 1. Register a client
	console.log("1. Registering OAuth client...");
	const regRes = await fetch(`${BASE}/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: "totp-smoke-test",
			redirect_uris: ["http://localhost:9999/callback"],
		}),
	});
	const client = (await regRes.json()) as { client_id: string };
	console.log(`   client_id: ${client.client_id}`);

	// 2. GET /authorize
	console.log("2. GET /authorize (should show passphrase-only form)...");
	const authUrl = `${BASE}/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent("http://localhost:9999/callback")}&response_type=code&scope=read%20write`;
	const authRes = await fetch(authUrl, { redirect: "manual" });
	const authHtml = await authRes.text();
	const csrfCookie = extractCookie(authRes, "ks_csrf");
	const requestNonce = extractValue(authHtml, "request_nonce");
	const csrfToken = extractValue(authHtml, "csrf_token");

	const hasTotpField = authHtml.includes('name="totp_code"');
	console.log(`   TOTP field present: ${hasTotpField} (expected: false)`);
	if (hasTotpField) throw new Error("TOTP field should not be present on first visit");
	console.log(`   request_nonce: ${requestNonce.slice(0, 12)}...`);

	// 3. POST /approve with correct passphrase → should get enrollment page
	console.log("3. POST /approve (should redirect to enrollment page)...");
	const approveBody = new URLSearchParams({
		request_nonce: requestNonce,
		csrf_token: csrfToken,
		passphrase: PASSPHRASE,
	});
	const approveRes = await fetch(`${BASE}/approve`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `ks_csrf=${csrfCookie}`,
		},
		body: approveBody.toString(),
		redirect: "manual",
	});
	const enrollHtml = await approveRes.text();

	if (!enrollHtml.includes("Set Up Two-Factor")) {
		console.error("   FAIL: Expected enrollment page, got:", enrollHtml.slice(0, 200));
		process.exit(1);
	}
	console.log("   Got enrollment page with QR code");

	const enrollNonce = extractValue(enrollHtml, "enroll_nonce");
	const enrollCsrf = extractValue(enrollHtml, "csrf_token");
	const enrollCsrfCookie = extractCookie(approveRes, "ks_csrf");
	console.log(`   enroll_nonce: ${enrollNonce.slice(0, 12)}...`);

	// Extract the TOTP secret from the displayed code element
	const secretMatch = enrollHtml.match(/<code>([A-Z2-7\s]+)<\/code>/);
	if (!secretMatch) throw new Error("Could not find TOTP secret in enrollment page");
	const secret = secretMatch[1].replace(/\s/g, "");
	console.log(`   secret: ${secret.slice(0, 8)}...`);

	// 4. Generate a valid TOTP code and POST /enroll-totp
	console.log("4. POST /enroll-totp (with valid TOTP code)...");
	const validCode = await computeTOTP(secret);
	console.log(`   TOTP code: ${validCode}`);

	const enrollRes = await fetch(`${BASE}/enroll-totp`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `ks_csrf=${enrollCsrfCookie}`,
		},
		body: new URLSearchParams({
			enroll_nonce: enrollNonce,
			csrf_token: enrollCsrf,
			totp_code: validCode,
		}).toString(),
		redirect: "manual",
	});

	if (enrollRes.status !== 302) {
		const body = await enrollRes.text();
		console.error(`   FAIL: Expected 302 redirect, got ${enrollRes.status}: ${body}`);
		process.exit(1);
	}
	const redirectLocation = enrollRes.headers.get("Location") ?? "";
	console.log(`   Enrolled! Redirect: ${redirectLocation.slice(0, 60)}...`);

	// 5. Verify Phase B: GET /authorize should now show TOTP field
	console.log("5. GET /authorize again (should show TOTP field)...");
	const auth2Res = await fetch(authUrl, { redirect: "manual" });
	const auth2Html = await auth2Res.text();
	const hasTotpField2 = auth2Html.includes('name="totp_code"');
	console.log(`   TOTP field present: ${hasTotpField2} (expected: true)`);
	if (!hasTotpField2) throw new Error("TOTP field should be present after enrollment");

	// 6. POST /approve with passphrase + TOTP
	console.log("6. POST /approve with passphrase + TOTP...");
	const csrf2Cookie = extractCookie(auth2Res, "ks_csrf");
	const nonce2 = extractValue(auth2Html, "request_nonce");
	const csrf2 = extractValue(auth2Html, "csrf_token");
	const code2 = await computeTOTP(secret);

	const approve2Res = await fetch(`${BASE}/approve`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `ks_csrf=${csrf2Cookie}`,
		},
		body: new URLSearchParams({
			request_nonce: nonce2,
			csrf_token: csrf2,
			passphrase: PASSPHRASE,
			totp_code: code2,
		}).toString(),
		redirect: "manual",
	});

	if (approve2Res.status !== 302) {
		const body = await approve2Res.text();
		console.error(`   FAIL: Expected 302, got ${approve2Res.status}: ${body}`);
		process.exit(1);
	}
	console.log(`   Authorized! Redirect: ${(approve2Res.headers.get("Location") ?? "").slice(0, 60)}...`);

	// 7. POST /approve with wrong TOTP
	console.log("7. POST /approve with wrong TOTP (should fail)...");
	const auth3Res = await fetch(authUrl, { redirect: "manual" });
	const auth3Html = await auth3Res.text();
	const csrf3Cookie = extractCookie(auth3Res, "ks_csrf");
	const nonce3 = extractValue(auth3Html, "request_nonce");
	const csrf3 = extractValue(auth3Html, "csrf_token");

	const approve3Res = await fetch(`${BASE}/approve`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `ks_csrf=${csrf3Cookie}`,
		},
		body: new URLSearchParams({
			request_nonce: nonce3,
			csrf_token: csrf3,
			passphrase: PASSPHRASE,
			totp_code: "000000",
		}).toString(),
		redirect: "manual",
	});

	if (approve3Res.status !== 403) {
		console.error(`   FAIL: Expected 403, got ${approve3Res.status}`);
		process.exit(1);
	}
	console.log(`   Correctly rejected with 403`);

	console.log("\n=== ALL SMOKE TESTS PASSED ===");
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
