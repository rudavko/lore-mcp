/** @implements NFR-001 — Pure enroll-totp HTML template: TOTP setup with QR code. */
import { escapeHtml, renderHtmlDocument } from "./template-helpers.pure.js";
const CSS = `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: auto; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0a1a; color: #fff; }
.bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.bg .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.6; }
.bg .orb:nth-child(1) { width: 55vmax; height: 55vmax; background: radial-gradient(circle, #6c3baa 0%, #4a1a8a 60%, transparent 70%); top: -18%; left: -12%; }
.bg .orb:nth-child(2) { width: 50vmax; height: 50vmax; background: radial-gradient(circle, #1a6baa 0%, #0e3d6b 60%, transparent 70%); bottom: -20%; right: -10%; }
.bg .orb:nth-child(3) { width: 40vmax; height: 40vmax; background: radial-gradient(circle, #0d9488 0%, #065f56 60%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); }
.bg .orb:nth-child(4) { width: 35vmax; height: 35vmax; background: radial-gradient(circle, #7c3aed 0%, #4c1d95 60%, transparent 70%); bottom: 10%; left: 15%; }
.card { position: relative; z-index: 1; width: 100%; max-width: 480px; margin: 1rem; padding: 2.75rem 2.5rem 2.5rem; background: rgba(255,255,255,0.07); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 8px 32px rgba(0,0,0,0.35); animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes cardIn { from { opacity: 0; transform: translateY(28px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.header { text-align: center; margin-bottom: 1.5rem; }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, rgba(124,58,237,0.35), rgba(13,148,136,0.25)); border: 1px solid rgba(255,255,255,0.12); margin-bottom: 1.1rem; font-size: 1.5rem; }
.title { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em; }
.subtitle { margin-top: 0.5rem; font-size: 0.85rem; color: rgba(255,255,255,0.5); line-height: 1.5; }
.qr-container { display: flex; justify-content: center; margin: 1.25rem 0; }
.qr-container svg { background: #fff; border-radius: 12px; padding: 12px; }
.secret-display { text-align: center; margin-bottom: 1.25rem; }
.secret-display .label { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4rem; }
.secret-display code { display: inline-block; font-family: 'SF Mono','Fira Code',monospace; font-size: 0.95rem; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.5rem 0.85rem; letter-spacing: 0.15em; }
label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.55rem; }
input[type="text"] { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 1.15rem; font-family: 'SF Mono','Fira Code',monospace; color: #fff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; text-align: center; letter-spacing: 0.3em; }
input:focus { border-color: rgba(124,58,237,0.6); background: rgba(255,255,255,0.09); }
button[type="submit"] { display: block; width: 100%; margin-top: 1.25rem; padding: 0.85rem 1.5rem; font-size: 0.95rem; font-weight: 600; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
.footer { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`;
/** Render the TOTP enrollment page as an HTML string.
 *  NOTE: p.qrSvg is server-generated SVG — inserted raw (not escaped). */
export function renderEnrollTotpPage(p) {
	return renderHtmlDocument({
		title: "Set Up Two-Factor — Lore",
		css: CSS,
		bodyHtml:
			'<div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>' +
			'<div class="card">' +
			'<div class="header">' +
			'<div class="icon" aria-hidden="true">&#128272;</div>' +
			'<h1 class="title">Set Up Two-Factor</h1>' +
			'<p class="subtitle">Scan the QR code with your authenticator app, then enter the 6-digit code to verify.</p></div>' +
			'<div class="qr-container">' +
			p.qrSvg +
			"</div>" +
			'<div class="secret-display"><div class="label">Manual entry key</div><code>' +
			escapeHtml(p.secretDisplay) +
			"</code></div>" +
			'<form action="/enroll-totp" method="POST">' +
			'<input type="hidden" name="enroll_nonce" value="' +
			escapeHtml(p.enrollNonce) +
			'" />' +
			'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
			'" />' +
			'<label for="totp_code">Verification code</label>' +
			'<input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="000000" />' +
			'<button type="submit">Verify &amp; Activate</button>' +
			"</form>" +
			'<div class="footer">This is a one-time setup. You\'ll need this code on every future login.</div>' +
			"</div>",
	});
}
