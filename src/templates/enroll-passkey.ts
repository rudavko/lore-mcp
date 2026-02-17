import { html, raw } from "hono/html";

// GEMINI-CONTEXT: Passkey enrollment page. The inline JS calls navigator.credentials.create()
// with the server-generated options, then populates a hidden field and auto-submits the form.
// If WebAuthn is unsupported, the page shows a message and a link to skip (complete OAuth if
// TOTP is already enrolled) or fall back to TOTP enrollment. The base64url encode/decode
// helpers mirror what @simplewebauthn/browser does internally, but inlined to avoid needing
// a client-side build pipeline. The cspNonce is a per-request random value injected into both
// the CSP header and the script tag to allow inline JS while keeping CSP strict.
//
// The regex escapes (\\+, \\/) in the inline JS are correct: in a JS template literal,
// \\\\ becomes \\ in the output, so the browser sees /\\+/g and /\\//g — valid regex for
// matching literal '+' and '/' characters for base64url conversion.

export interface EnrollPasskeyParams {
	enrollNonce: string;
	csrfToken: string;
	optionsJSON: string; // JSON-serialized PublicKeyCredentialCreationOptionsJSON
	cspNonce: string;
	totpEnrolled: boolean;
}

export function renderEnrollPasskeyPage(p: EnrollPasskeyParams) {
	const skipLabel = p.totpEnrolled ? "Skip — use authenticator code" : "Set up authenticator code instead";
	const skipAction = p.totpEnrolled ? "/complete-passkey-skip" : "/enroll-totp-redirect";

	return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Set Up Passkey — Lore</title>
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.json" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: auto; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
      background: #0a0a1a; color: #fff;
    }
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
    .bg::after { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-size: 128px 128px; opacity: 0.03; pointer-events: none; }
    .card { position: relative; z-index: 1; width: 100%; max-width: 480px; margin: 1rem; padding: 2.75rem 2.5rem 2.5rem; background: rgba(255,255,255,0.07); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.08) inset; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both; }
    @keyframes cardIn { from { opacity: 0; transform: translateY(28px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .card::before { content: ''; position: absolute; top: 0; left: 24px; right: 24px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); border-radius: 1px; }
    .header { text-align: center; margin-bottom: 1.5rem; }
    .icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, rgba(124,58,237,0.35), rgba(13,148,136,0.25)); border: 1px solid rgba(255,255,255,0.12); margin-bottom: 1.1rem; font-size: 1.5rem; line-height: 1; box-shadow: 0 4px 16px rgba(124,58,237,0.2); }
    .title { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em; color: #fff; }
    .subtitle { margin-top: 0.5rem; font-size: 0.85rem; color: rgba(255,255,255,0.5); font-weight: 400; line-height: 1.5; }
    .status { text-align: center; margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.7); }
    .status.error { border-color: rgba(239,68,68,0.3); color: rgba(239,68,68,0.85); }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: rgba(124,58,237,0.8); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .fallback-link { display: block; text-align: center; margin-top: 1.25rem; font-size: 0.82rem; color: rgba(255,255,255,0.4); text-decoration: underline; text-underline-offset: 2px; }
    .fallback-link:hover { color: rgba(255,255,255,0.6); }
    .footer { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); line-height: 1.6; }
    input:focus-visible, button:focus-visible { outline: 2px solid rgba(124,58,237,0.7); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
    @media (max-width: 480px) { .card { padding: 2rem 1.5rem 1.75rem; border-radius: 20px; } .title { font-size: 1.3rem; } }
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>
  <div class="card">
    <div class="header">
      <div class="icon" aria-hidden="true">&#128273;</div>
      <h1 class="title">Set Up Passkey</h1>
      <p class="subtitle">Register a passkey for fast, phishing-resistant login.</p>
    </div>
    <div id="status" class="status"><span class="spinner"></span>Waiting for passkey prompt&hellip;</div>
    <form id="enrollForm" action="/enroll-passkey" method="POST" style="display:none">
      <input type="hidden" name="enroll_nonce" value="${p.enrollNonce}" />
      <input type="hidden" name="csrf_token" value="${p.csrfToken}" />
      <input type="hidden" name="registration_response" id="registrationResponse" />
    </form>
    <noscript>
      <div class="status error">JavaScript is required to register a passkey.</div>
    </noscript>
    <a class="fallback-link" href="${skipAction}?nonce=${p.enrollNonce}&csrf=${p.csrfToken}">${skipLabel}</a>
    <div class="footer">
      Your passkey is stored on your device. It never leaves your hardware.
    </div>
  </div>
  ${raw(`<script nonce="${p.cspNonce}">`)}
  (function(){
    var statusEl = document.getElementById('status');
    function b64d(s) {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var bin = atob(s), a = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return a.buffer;
    }
    function b64e(buf) {
      var b = new Uint8Array(buf), s = '';
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=/g, '');
    }
    if (!window.PublicKeyCredential) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Passkeys are not supported in this browser.';
      return;
    }
    var opts = ${raw(p.optionsJSON)};
    opts.challenge = b64d(opts.challenge);
    opts.user.id = b64d(opts.user.id);
    if (opts.excludeCredentials) {
      opts.excludeCredentials = opts.excludeCredentials.map(function(c) {
        return Object.assign({}, c, { id: b64d(c.id) });
      });
    }
    navigator.credentials.create({ publicKey: opts }).then(function(cred) {
      var resp = {
        id: cred.id,
        rawId: b64e(cred.rawId),
        type: cred.type,
        response: {
          attestationObject: b64e(cred.response.attestationObject),
          clientDataJSON: b64e(cred.response.clientDataJSON),
          transports: cred.response.getTransports ? cred.response.getTransports() : [],
          publicKey: cred.response.getPublicKey ? b64e(cred.response.getPublicKey()) : undefined,
          authenticatorData: cred.response.getAuthenticatorData ? b64e(cred.response.getAuthenticatorData()) : undefined
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment
      };
      document.getElementById('registrationResponse').value = JSON.stringify(resp);
      document.getElementById('enrollForm').submit();
    }).catch(function(err) {
      statusEl.className = 'status error';
      var detail = err.name + ': ' + err.message + ' [rpId=' + (opts.rp && opts.rp.id || 'none') + ', origin=' + location.origin + ']';
      if (err.name === 'InvalidStateError') {
        statusEl.textContent = 'This passkey is already registered.';
      } else if (err.name === 'NotAllowedError') {
        statusEl.innerHTML = 'Passkey registration was cancelled or timed out.<br><small style="opacity:0.6">' + detail + '</small>';
      } else {
        statusEl.innerHTML = 'Passkey registration failed.<br><small style="opacity:0.6">' + detail + '</small>';
      }
      console.error('WebAuthn registration error:', detail, err);
    });
  })();
  ${raw("</script>")}
</body>
</html>`;
}
