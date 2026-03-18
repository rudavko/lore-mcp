/** @implements NFR-001 — Pure auth page HTML template: string concatenation with manual escaping. */
import { escapeHtml, renderHtmlDocument } from "./template-helpers.pure.js";
/** Sentinel for TDD hook. */
export const _MODULE = "auth-page.pure";
const CSS = `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; background: #0a0a1a; color: #fff; }
.bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.bg .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.6; will-change: transform; }
.bg .orb:nth-child(1) { width: 55vmax; height: 55vmax; background: radial-gradient(circle, #6c3baa 0%, #4a1a8a 60%, transparent 70%); top: -18%; left: -12%; animation: d1 18s ease-in-out infinite alternate; }
.bg .orb:nth-child(2) { width: 50vmax; height: 50vmax; background: radial-gradient(circle, #1a6baa 0%, #0e3d6b 60%, transparent 70%); bottom: -20%; right: -10%; animation: d2 22s ease-in-out infinite alternate; }
.bg .orb:nth-child(3) { width: 40vmax; height: 40vmax; background: radial-gradient(circle, #0d9488 0%, #065f56 60%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); animation: d3 20s ease-in-out infinite alternate; }
.bg .orb:nth-child(4) { width: 35vmax; height: 35vmax; background: radial-gradient(circle, #7c3aed 0%, #4c1d95 60%, transparent 70%); bottom: 10%; left: 15%; animation: d4 25s ease-in-out infinite alternate; }
@keyframes d1 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(12vw,8vh) scale(1.08); } 100% { transform: translate(-5vw,15vh) scale(0.95); } }
@keyframes d2 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(-10vw,-12vh) scale(1.1); } 100% { transform: translate(6vw,-6vh) scale(0.92); } }
@keyframes d3 { 0% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-40%,-60%) scale(1.15); } 100% { transform: translate(-60%,-45%) scale(0.9); } }
@keyframes d4 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(8vw,-10vh) scale(1.05); } 100% { transform: translate(-6vw,5vh) scale(1.12); } }
.card { position: relative; z-index: 1; width: 100%; max-width: 440px; margin: 1rem; padding: 2.75rem 2.5rem 2.5rem; background: rgba(255,255,255,0.07); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 8px 32px rgba(0,0,0,0.35); animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes cardIn { from { opacity: 0; transform: translateY(28px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.header { text-align: center; margin-bottom: 1.75rem; }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, rgba(124,58,237,0.35), rgba(13,148,136,0.25)); border: 1px solid rgba(255,255,255,0.12); margin-bottom: 1.1rem; font-size: 1.5rem; }
.title { font-size: 1.65rem; font-weight: 700; letter-spacing: 0.06em; }
.backronym { margin-top: 0.35rem; font-size: 0.78rem; color: rgba(255,255,255,0.35); letter-spacing: 0.12em; text-transform: uppercase; }
.backronym span { color: rgba(124,58,237,0.85); font-weight: 700; }
.subtitle { margin-top: 0.5rem; font-size: 0.88rem; color: rgba(255,255,255,0.5); }
.client-info { margin-bottom: 1.5rem; padding: 0.85rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }
.client-info dt { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; }
.client-info dd { font-size: 0.9rem; color: rgba(255,255,255,0.85); margin: 0 0 0.65rem; }
.client-info dd:last-child { margin-bottom: 0; }
label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.55rem; }
input[type="password"], input[type="text"] { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 1rem; font-family: inherit; color: #fff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; }
input:focus { border-color: rgba(124,58,237,0.6); background: rgba(255,255,255,0.09); }
input[type="text"] { font-family: 'SF Mono','Fira Code',monospace; text-align: center; letter-spacing: 0.3em; margin-top: 0.75rem; }
button[type="submit"] { display: block; width: 100%; margin-top: 1.25rem; padding: 0.85rem 1.5rem; font-size: 0.95rem; font-weight: 600; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
.totp-fallback { margin-top: 0.75rem; }
.totp-fallback summary { font-size: 0.8rem; color: rgba(255,255,255,0.4); cursor: pointer; text-align: center; list-style: none; }
.status { text-align: center; margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.7); }
.status.error { border-color: rgba(239,68,68,0.3); color: rgba(239,68,68,0.85); }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: rgba(124,58,237,0.8); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem; }
@keyframes spin { to { transform: rotate(360deg); } }
.fallback-link { display: block; text-align: center; margin-top: 1.25rem; font-size: 0.82rem; color: rgba(255,255,255,0.4); text-decoration: underline; }
.footer { margin-top: 1.5rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`;
function clientInfoHtml(p) {
	let appCell = "";
	if (p.clientUri) {
		appCell =
			'<a href="' +
				escapeHtml(p.clientUri) +
				'" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.85);text-decoration:underline">' +
				escapeHtml(p.clientName) +
				"</a>";
		} else {
			appCell = escapeHtml(p.clientName);
		}
	return (
		'<dl class="client-info"><dt>Application</dt><dd>' +
		appCell +
		"</dd><dt>Permissions</dt><dd>" +
			escapeHtml(p.scopes) +
		"</dd></dl>"
	);
}
function passkeyOnlyHtml(p) {
	let fallback = "";
	if (p.fallbackUrl) {
		fallback =
			'<a class="fallback-link" href="' +
				escapeHtml(p.fallbackUrl) +
			'">Use passphrase + code instead</a>';
	}
	return (
		'<div id="status" class="status"><span class="spinner"></span>Authenticating with passkey&hellip;</div>' +
		'<form id="authForm" action="/approve" method="POST" style="display:none">' +
		'<input type="hidden" name="request_nonce" value="' +
			escapeHtml(p.requestNonce) +
		'" />' +
		'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
		'" />' +
		'<input type="hidden" name="webauthn_response" id="webauthnResponse" />' +
		"</form>" +
		'<noscript><div class="status error">JavaScript is required for passkey authentication.</div></noscript>' +
		fallback
	);
}
function passphraseFormHtml(p) {
	const needsJs = p.authOptionsJSON && p.cspNonce;
	const totpRequired = p.totpEnrolled && !p.passkeyEnrolled;
	let webauthnHidden = "";
	if (needsJs) {
		webauthnHidden = '<input type="hidden" name="webauthn_response" id="webauthnResponse" />';
	}
	let totpHtml = "";
	if (p.passkeyEnrolled && p.totpEnrolled) {
		totpHtml =
			'<details class="totp-fallback"><summary>Use authenticator code instead</summary>' +
			'<label for="totp_code" style="margin-top:0.75rem">Authenticator code</label>' +
			'<input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" />' +
			"</details>";
	} else if (p.totpEnrolled) {
		totpHtml =
			'<label for="totp_code" style="margin-top:0.75rem">Authenticator code</label>' +
			'<input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" ' +
			(totpRequired ? "required " : "") +
			'autocomplete="one-time-code" placeholder="000000" />';
	}
	return (
		'<form id="authForm" action="/approve" method="POST">' +
		'<input type="hidden" name="request_nonce" value="' +
			escapeHtml(p.requestNonce) +
		'" />' +
		'<input type="hidden" name="csrf_token" value="' +
			escapeHtml(p.csrfToken) +
		'" />' +
		webauthnHidden +
		'<label for="passphrase">Passphrase</label>' +
		'<input id="passphrase" type="password" name="passphrase" required autocomplete="current-password" placeholder="Enter your passphrase" />' +
		totpHtml +
		'<button type="submit">Authorize</button></form>'
	);
}
function webauthnScript(p) {
	if (!p.authOptionsJSON || !p.cspNonce) {
		return "";
	}
	const helpers =
		"function b64d(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer;}" +
		"function b64e(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/[+]/g,'-').replace(/[/]/g,'_').replace(/=/g,'');}";
	if (p.passkeyOnly) {
		return (
			'<script nonce="' +
				escapeHtml(p.cspNonce) +
			'">(function(){' +
			"var statusEl=document.getElementById('status');" +
			helpers +
			"if(!window.PublicKeyCredential){statusEl.className='status error';statusEl.textContent='Passkeys not supported.';return;}" +
			"var opts=" +
			p.authOptionsJSON +
			";" +
			"if(!opts||typeof opts.challenge!=='string'){statusEl.className='status error';statusEl.textContent='Passkey configuration invalid. Use passphrase + code instead.';return;}" +
			"opts.challenge=b64d(opts.challenge);" +
			"if(opts.allowCredentials){opts.allowCredentials=opts.allowCredentials.filter(function(c){return c&&typeof c.id==='string'&&c.id.length>0;}).map(function(c){return Object.assign({},c,{id:b64d(c.id)});});}" +
			"navigator.credentials.get({publicKey:opts}).then(function(cred){" +
			"document.getElementById('webauthnResponse').value=JSON.stringify({id:b64e(cred.rawId),rawId:b64e(cred.rawId),type:cred.type,response:{authenticatorData:b64e(cred.response.authenticatorData),clientDataJSON:b64e(cred.response.clientDataJSON),signature:b64e(cred.response.signature),userHandle:cred.response.userHandle?b64e(cred.response.userHandle):undefined},clientExtensionResults:cred.getClientExtensionResults(),authenticatorAttachment:cred.authenticatorAttachment});" +
			"document.getElementById('authForm').submit();" +
			"}).catch(function(err){statusEl.className='status error';statusEl.textContent=err.name==='NotAllowedError'?'Cancelled or timed out.':'Failed: '+err.message;});" +
			"})();</script>"
		);
	}
	return (
		'<script nonce="' +
			escapeHtml(p.cspNonce) +
		'">(function(){' +
		helpers +
		"if(!window.PublicKeyCredential)return;" +
		"var form=document.getElementById('authForm'),submitted=false;" +
		"form.addEventListener('submit',function(e){" +
		"if(submitted||document.getElementById('webauthnResponse').value)return;" +
		"var totpField=document.getElementById('totp_code');" +
		"if(totpField&&totpField.value.length===6)return;" +
		"e.preventDefault();" +
		"var opts=" +
		p.authOptionsJSON +
		";" +
		"if(!opts||typeof opts.challenge!=='string')return;" +
		"opts.challenge=b64d(opts.challenge);" +
		"if(opts.allowCredentials){opts.allowCredentials=opts.allowCredentials.filter(function(c){return c&&typeof c.id==='string'&&c.id.length>0;}).map(function(c){return Object.assign({},c,{id:b64d(c.id)});});}" +
		"navigator.credentials.get({publicKey:opts}).then(function(cred){" +
		"document.getElementById('webauthnResponse').value=JSON.stringify({id:b64e(cred.rawId),rawId:b64e(cred.rawId),type:cred.type,response:{authenticatorData:b64e(cred.response.authenticatorData),clientDataJSON:b64e(cred.response.clientDataJSON),signature:b64e(cred.response.signature),userHandle:cred.response.userHandle?b64e(cred.response.userHandle):undefined},clientExtensionResults:cred.getClientExtensionResults(),authenticatorAttachment:cred.authenticatorAttachment});" +
		"submitted=true;form.submit();" +
		"}).catch(function(){var d=form.querySelector('details.totp-fallback');if(d)d.open=true;});" +
		"});" +
		"})();</script>"
	);
}
/** Render the OAuth authorization page as an HTML string. */
export function renderAuthPage(p) {
	const bodyContent = p.passkeyOnly ? passkeyOnlyHtml(p) : passphraseFormHtml(p);
	return renderHtmlDocument({
		title: "Authorize — Lore",
		css: CSS,
		bodyHtml:
			'<div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>' +
			'<div class="card">' +
			'<div class="header">' +
			'<div class="icon" aria-hidden="true">&#128274;</div>' +
			'<h1 class="title">LORE</h1>' +
			'<p class="backronym"><span>L</span>inked <span>O</span>bject <span>R</span>etrieval <span>E</span>ngine</p>' +
			'<p class="subtitle">Authorize access to your knowledge store</p></div>' +
			clientInfoHtml(p) +
			bodyContent +
			'<div class="footer">This grants <strong>' +
			escapeHtml(p.clientName) +
			"</strong> read &amp; write access to your entries and triples.</div>" +
			"</div>" +
			webauthnScript(p),
	});
}
