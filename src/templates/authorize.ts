import { html, raw } from "hono/html";

// GEMINI-CONTEXT: All dynamic values are escaped by hono/html tagged template literal.
// Two rendering modes: passkeyOnly=true auto-triggers navigator.credentials.get() on page load
// with no passphrase field. passkeyOnly=false renders the passphrase form (with optional TOTP).
// When passkeyOnly=false and passkeyEnrolled=true, inline JS intercepts form submit to call
// navigator.credentials.get(), populates a hidden webauthn_response field, then submits. If
// WebAuthn fails or user cancels, the TOTP field is revealed as fallback. The cspNonce is only
// present when JS is needed. Character-class regex [+] and [/] is used in inline JS to avoid
// escaping issues in the HTML template.

export interface AuthPageParams {
	requestNonce: string;
	csrfToken: string;
	clientName: string;
	clientUri: string;
	scopes: string;
	totpEnrolled: boolean;
	passkeyEnrolled: boolean;
	passkeyOnly: boolean;
	fallbackUrl?: string;
	authOptionsJSON?: string; // JSON-serialized PublicKeyCredentialRequestOptionsJSON
	cspNonce?: string;
}

export function renderAuthPage(p: AuthPageParams) {
	const needsJs = p.authOptionsJSON && p.cspNonce;

	// When passkey is enrolled, TOTP is fallback (not required).
	// When only TOTP is enrolled, TOTP is required.
	const totpRequired = p.totpEnrolled && !p.passkeyEnrolled;

	return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorize — Lore</title>
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.json" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex; align-items: center; justify-content: center;
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
    .card { position: relative; z-index: 1; width: 100%; max-width: 440px; margin: 1rem; padding: 2.75rem 2.5rem 2.5rem; background: rgba(255,255,255,0.07); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.08) inset; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both; }
    @keyframes cardIn { from { opacity: 0; transform: translateY(28px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .card::before { content: ''; position: absolute; top: 0; left: 24px; right: 24px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); border-radius: 1px; }
    .header { text-align: center; margin-bottom: 1.75rem; }
    .icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, rgba(124,58,237,0.35), rgba(13,148,136,0.25)); border: 1px solid rgba(255,255,255,0.12); margin-bottom: 1.1rem; font-size: 1.5rem; line-height: 1; box-shadow: 0 4px 16px rgba(124,58,237,0.2); animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
    .title { font-size: 1.65rem; font-weight: 700; letter-spacing: 0.06em; color: #fff; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.15s both; }
    .backronym { margin-top: 0.35rem; font-size: 0.78rem; font-weight: 500; color: rgba(255,255,255,0.35); letter-spacing: 0.12em; text-transform: uppercase; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.17s both; }
    .backronym span { color: rgba(124,58,237,0.85); font-weight: 700; }
    .subtitle { margin-top: 0.5rem; font-size: 0.88rem; color: rgba(255,255,255,0.5); font-weight: 400; line-height: 1.5; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both; }
    .client-info { margin-bottom: 1.5rem; padding: 0.85rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.22s both; }
    .client-info dt { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; }
    .client-info dd { font-size: 0.9rem; color: rgba(255,255,255,0.85); margin: 0 0 0.65rem; }
    .client-info dd:last-child { margin-bottom: 0; }
    form { animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.55rem; }
    input[type="password"], input[type="text"] { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 1rem; font-family: inherit; color: #fff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15) inset; transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease; }
    input[type="password"]::placeholder, input[type="text"]::placeholder { color: rgba(255,255,255,0.25); }
    input[type="password"]:focus, input[type="text"]:focus { border-color: rgba(124,58,237,0.6); background: rgba(255,255,255,0.09); box-shadow: 0 2px 6px rgba(0,0,0,0.15) inset, 0 0 0 3px rgba(124,58,237,0.15), 0 0 20px rgba(124,58,237,0.08); }
    input[type="text"] { font-family: 'SF Mono', 'Fira Code', monospace; text-align: center; letter-spacing: 0.3em; margin-top: 0.75rem; }
    button[type="submit"] { display: block; width: 100%; margin-top: 1.25rem; padding: 0.85rem 1.5rem; font-size: 0.95rem; font-weight: 600; font-family: inherit; letter-spacing: 0.01em; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; position: relative; overflow: hidden; transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
    button[type="submit"]::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 60%); border-radius: inherit; pointer-events: none; }
    button[type="submit"]:hover { transform: translateY(-2px) scale(1.01); box-shadow: 0 8px 24px rgba(124,58,237,0.4), 0 2px 8px rgba(124,58,237,0.25); }
    button[type="submit"]:active { transform: translateY(0) scale(0.99); box-shadow: 0 2px 8px rgba(124,58,237,0.3); }
    button[type="submit"]::after { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent); transition: left 0.5s ease; pointer-events: none; }
    button[type="submit"]:hover::after { left: 100%; }
    .totp-fallback { margin-top: 0.75rem; }
    .totp-fallback summary { font-size: 0.8rem; color: rgba(255,255,255,0.4); cursor: pointer; text-align: center; list-style: none; }
    .totp-fallback summary::-webkit-details-marker { display: none; }
    .totp-fallback summary:hover { color: rgba(255,255,255,0.6); }
    .status { text-align: center; margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.7); }
    .status.error { border-color: rgba(239,68,68,0.3); color: rgba(239,68,68,0.85); }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: rgba(124,58,237,0.8); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 0.5rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .fallback-link { display: block; text-align: center; margin-top: 1.25rem; font-size: 0.82rem; color: rgba(255,255,255,0.4); text-decoration: underline; text-underline-offset: 2px; }
    .fallback-link:hover { color: rgba(255,255,255,0.6); }
    .footer { margin-top: 1.5rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.35s both; line-height: 1.6; }
    .footer a { color: rgba(255,255,255,0.35); text-decoration: underline; text-underline-offset: 2px; }
    .footer a:hover { color: rgba(255,255,255,0.55); }
    @media (max-width: 480px) { .card { padding: 2rem 1.5rem 1.75rem; border-radius: 20px; } .title { font-size: 1.4rem; } .icon { width: 46px; height: 46px; font-size: 1.3rem; border-radius: 14px; } }
    input:focus-visible, button:focus-visible { outline: 2px solid rgba(124,58,237,0.7); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>
  <div class="card">
    <div class="header">
      <div class="icon" aria-hidden="true">&#128274;</div>
      <h1 class="title">LORE</h1>
      <p class="backronym"><span>L</span>inked <span>O</span>bject <span>R</span>etrieval <span>E</span>ngine</p>
      <p class="subtitle">Authorize access to your knowledge store</p>
    </div>
    <dl class="client-info">
      <dt>Application</dt>
      <dd>${p.clientUri ? html`<a href="${p.clientUri}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.85);text-decoration:underline;text-underline-offset:2px">${p.clientName}</a>` : html`${p.clientName}`}</dd>
      <dt>Permissions</dt>
      <dd>${p.scopes}</dd>
    </dl>
    ${p.passkeyOnly ? html`
    <div id="status" class="status"><span class="spinner"></span>Authenticating with passkey&hellip;</div>
    <form id="authForm" action="/approve" method="POST" style="display:none">
      <input type="hidden" name="request_nonce" value="${p.requestNonce}" />
      <input type="hidden" name="csrf_token" value="${p.csrfToken}" />
      <input type="hidden" name="webauthn_response" id="webauthnResponse" />
    </form>
    <noscript><div class="status error">JavaScript is required for passkey authentication.</div></noscript>
    ${p.fallbackUrl ? html`<a class="fallback-link" href="${p.fallbackUrl}">Use passphrase + code instead</a>` : html``}
    ` : html`
    <form id="authForm" action="/approve" method="POST">
      <input type="hidden" name="request_nonce" value="${p.requestNonce}" />
      <input type="hidden" name="csrf_token" value="${p.csrfToken}" />
      ${needsJs ? html`<input type="hidden" name="webauthn_response" id="webauthnResponse" />` : html``}
      <label for="passphrase">Passphrase</label>
      <input id="passphrase" type="password" name="passphrase" required autocomplete="current-password" placeholder="Enter your passphrase" />
      ${p.passkeyEnrolled && p.totpEnrolled ? html`
      <details class="totp-fallback">
        <summary>Use authenticator code instead</summary>
        <label for="totp_code" style="margin-top:0.75rem">Authenticator code</label>
        <input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" />
      </details>
      ` : p.totpEnrolled ? html`
      <label for="totp_code" style="margin-top:0.75rem">Authenticator code</label>
      <input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" ${totpRequired ? html`required` : html``} autocomplete="one-time-code" placeholder="000000" />
      ` : html``}
      <button type="submit">Authorize</button>
    </form>
    `}
    <div class="footer">
      This grants <strong>${p.clientName}</strong> read &amp; write access to your entries and triples.<br />
      You can revoke access at any time by rotating your passphrase.
    </div>
  </div>
  ${needsJs ? html`${raw(`<script nonce="${p.cspNonce}">`)}
  ${p.passkeyOnly ? html`(function(){
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
    var opts = ${raw(p.authOptionsJSON!)};
    opts.challenge = b64d(opts.challenge);
    if (opts.allowCredentials) {
      opts.allowCredentials = opts.allowCredentials.map(function(c) {
        return Object.assign({}, c, { id: b64d(c.id) });
      });
    }
    navigator.credentials.get({ publicKey: opts }).then(function(cred) {
      var resp = {
        id: cred.id,
        rawId: b64e(cred.rawId),
        type: cred.type,
        response: {
          authenticatorData: b64e(cred.response.authenticatorData),
          clientDataJSON: b64e(cred.response.clientDataJSON),
          signature: b64e(cred.response.signature),
          userHandle: cred.response.userHandle ? b64e(cred.response.userHandle) : undefined
        },
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment
      };
      document.getElementById('webauthnResponse').value = JSON.stringify(resp);
      document.getElementById('authForm').submit();
    }).catch(function(err) {
      statusEl.className = 'status error';
      if (err.name === 'NotAllowedError') {
        statusEl.textContent = 'Passkey authentication was cancelled or timed out.';
      } else {
        statusEl.textContent = 'Passkey authentication failed: ' + err.message;
      }
    });
  })();` : html`(function(){
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
    if (!window.PublicKeyCredential) return;
    var form = document.getElementById('authForm');
    var submitted = false;
    form.addEventListener('submit', function(e) {
      if (submitted) return;
      if (document.getElementById('webauthnResponse').value) return;
      var totpField = document.getElementById('totp_code');
      if (totpField && totpField.value.length === 6) return;
      e.preventDefault();
      var opts = ${raw(p.authOptionsJSON!)};
      opts.challenge = b64d(opts.challenge);
      if (opts.allowCredentials) {
        opts.allowCredentials = opts.allowCredentials.map(function(c) {
          return Object.assign({}, c, { id: b64d(c.id) });
        });
      }
      navigator.credentials.get({ publicKey: opts }).then(function(cred) {
        var resp = {
          id: cred.id,
          rawId: b64e(cred.rawId),
          type: cred.type,
          response: {
            authenticatorData: b64e(cred.response.authenticatorData),
            clientDataJSON: b64e(cred.response.clientDataJSON),
            signature: b64e(cred.response.signature),
            userHandle: cred.response.userHandle ? b64e(cred.response.userHandle) : undefined
          },
          clientExtensionResults: cred.getClientExtensionResults(),
          authenticatorAttachment: cred.authenticatorAttachment
        };
        document.getElementById('webauthnResponse').value = JSON.stringify(resp);
        submitted = true;
        form.submit();
      }).catch(function() {
        var details = form.querySelector('details.totp-fallback');
        if (details) details.open = true;
      });
    });
  })();`}
  ${raw("</script>")}` : html``}
</body>
</html>`;
}
