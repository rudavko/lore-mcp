/** @implements NFR-001 — Pure enroll-passkey HTML template: passkey registration page. */
import { escapeHtml, renderHtmlDocument } from "./template-helpers.pure.js";
const CSS = `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: auto; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0a1a; color: #fff; }
.bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.bg .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.6; will-change: transform; }
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
.status { text-align: center; margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.7); }
.status.error { border-color: rgba(239,68,68,0.3); color: rgba(239,68,68,0.85); }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: rgba(124,58,237,0.8); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem; }
@keyframes spin { to { transform: rotate(360deg); } }
.fallback-link { display: block; text-align: center; margin-top: 1.25rem; font-size: 0.82rem; color: rgba(255,255,255,0.4); text-decoration: underline; }
.footer { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`;
/** Render the passkey enrollment page as an HTML string. */
export function renderEnrollPasskeyPage(p) {
	let alternateActionHtml = "";
	if (p.canSkipPasskey) {
		alternateActionHtml +=
			'<form action="/complete-passkey-skip" method="POST">' +
			'<input type="hidden" name="enroll_nonce" value="' +
			escapeHtml(p.enrollNonce) +
			'" />' +
			'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
			'" />' +
			'<button type="submit" class="fallback-link" style="background:none;border:none;padding:0">Skip passkey setup for now</button>' +
			"</form>";
	}
	if (p.canStartTotpEnrollment) {
		alternateActionHtml +=
			'<form action="/enroll-totp-redirect" method="POST">' +
			'<input type="hidden" name="enroll_nonce" value="' +
			escapeHtml(p.enrollNonce) +
			'" />' +
			'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
			'" />' +
			'<button type="submit" class="fallback-link" style="background:none;border:none;padding:0">Set up authenticator code instead</button>' +
			"</form>";
	}
	const optionsJSON = p.optionsJSON.replace(/<\//g, "<\\/");
	const webauthnScript =
		'<script nonce="' +
			escapeHtml(p.cspNonce) +
		'">(function(){' +
		"var statusEl=document.getElementById('status');" +
		"function b64d(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer;}" +
		"function b64e(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/[+]/g,'-').replace(/[/]/g,'_').replace(/=/g,'');}" +
		"if(!window.PublicKeyCredential){statusEl.className='status error';statusEl.textContent='Passkeys not supported.';return;}" +
		"var opts=" +
		optionsJSON +
		";" +
		"opts.challenge=b64d(opts.challenge);opts.user.id=b64d(opts.user.id);" +
		"if(opts.excludeCredentials){opts.excludeCredentials=opts.excludeCredentials.map(function(c){return Object.assign({},c,{id:b64d(c.id)});});}" +
		"navigator.credentials.create({publicKey:opts}).then(function(cred){" +
		"var resp={id:cred.id,rawId:b64e(cred.rawId),type:cred.type,response:{attestationObject:b64e(cred.response.attestationObject),clientDataJSON:b64e(cred.response.clientDataJSON),transports:cred.response.getTransports?cred.response.getTransports():[],publicKey:cred.response.getPublicKey?b64e(cred.response.getPublicKey()):undefined,authenticatorData:cred.response.getAuthenticatorData?b64e(cred.response.getAuthenticatorData()):undefined},clientExtensionResults:cred.getClientExtensionResults(),authenticatorAttachment:cred.authenticatorAttachment};" +
		"document.getElementById('registrationResponse').value=JSON.stringify(resp);" +
		"document.getElementById('enrollForm').submit();" +
		"}).catch(function(err){" +
		"statusEl.className='status error';" +
		"if(err.name==='InvalidStateError'){statusEl.textContent='This passkey is already registered.';}" +
		"else if(err.name==='NotAllowedError'){statusEl.textContent='Registration was cancelled or timed out.';}" +
		"else{statusEl.textContent='Registration failed: '+err.message;}" +
		"});" +
		"})();</script>";
	return renderHtmlDocument({
		title: "Set Up Passkey — Lore",
		css: CSS,
		bodyHtml:
			'<div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>' +
			'<div class="card">' +
			'<div class="header">' +
			'<div class="icon" aria-hidden="true">&#128273;</div>' +
			'<h1 class="title">Set Up Passkey</h1>' +
			'<p class="subtitle">Register a passkey for fast, phishing-resistant login.</p></div>' +
			'<div id="status" class="status"><span class="spinner"></span>Waiting for passkey prompt&hellip;</div>' +
			'<form id="enrollForm" action="/enroll-passkey" method="POST" style="display:none">' +
			'<input type="hidden" name="enroll_nonce" value="' +
			escapeHtml(p.enrollNonce) +
			'" />' +
			'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
			'" />' +
			'<input type="hidden" name="registration_response" id="registrationResponse" />' +
			"</form>" +
			'<noscript><div class="status error">JavaScript is required to register a passkey.</div></noscript>' +
			alternateActionHtml +
			'<div class="footer">Your passkey is stored on your device. It never leaves your hardware.</div>' +
			"</div>" +
			webauthnScript,
	});
}
