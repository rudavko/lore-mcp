import { html, raw } from "hono/html";

export interface EnrollTotpParams {
	qrSvg: string;
	secretDisplay: string;
	enrollNonce: string;
	csrfToken: string;
}

// GEMINI-CONTEXT: raw() is safe here — qrSvg is server-generated from qrcode-svg library,
// no user data flows into it. secretDisplay is base32 with spaces, pre-validated.

export function renderEnrollTotpPage(p: EnrollTotpParams) {
	return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Set Up Two-Factor — Lore</title>
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
    .qr-container { display: flex; justify-content: center; margin: 1.25rem 0; }
    .qr-container svg { background: #fff; border-radius: 12px; padding: 12px; }
    .secret-display { text-align: center; margin-bottom: 1.25rem; }
    .secret-display .label { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4rem; }
    .secret-display code { display: inline-block; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.95rem; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.5rem 0.85rem; letter-spacing: 0.15em; word-break: break-all; }
    form { animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.55rem; }
    input[type="text"] { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 1.15rem; font-family: 'SF Mono', 'Fira Code', monospace; color: #fff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15) inset; transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease; text-align: center; letter-spacing: 0.3em; }
    input[type="text"]::placeholder { color: rgba(255,255,255,0.25); letter-spacing: 0.1em; }
    input[type="text"]:focus { border-color: rgba(124,58,237,0.6); background: rgba(255,255,255,0.09); box-shadow: 0 2px 6px rgba(0,0,0,0.15) inset, 0 0 0 3px rgba(124,58,237,0.15), 0 0 20px rgba(124,58,237,0.08); }
    button[type="submit"] { display: block; width: 100%; margin-top: 1.25rem; padding: 0.85rem 1.5rem; font-size: 0.95rem; font-weight: 600; font-family: inherit; letter-spacing: 0.01em; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; position: relative; overflow: hidden; transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
    button[type="submit"]::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 60%); border-radius: inherit; pointer-events: none; }
    button[type="submit"]:hover { transform: translateY(-2px) scale(1.01); box-shadow: 0 8px 24px rgba(124,58,237,0.4), 0 2px 8px rgba(124,58,237,0.25); }
    button[type="submit"]:active { transform: translateY(0) scale(0.99); box-shadow: 0 2px 8px rgba(124,58,237,0.3); }
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
      <div class="icon" aria-hidden="true">&#128272;</div>
      <h1 class="title">Set Up Two-Factor</h1>
      <p class="subtitle">Scan the QR code with your authenticator app, then enter the 6-digit code to verify.</p>
    </div>
    <div class="qr-container">${raw(p.qrSvg)}</div>
    <div class="secret-display">
      <div class="label">Manual entry key</div>
      <code>${p.secretDisplay}</code>
    </div>
    <form action="/enroll-totp" method="POST">
      <input type="hidden" name="enroll_nonce" value="${p.enrollNonce}" />
      <input type="hidden" name="csrf_token" value="${p.csrfToken}" />
      <label for="totp_code">Verification code</label>
      <input id="totp_code" type="text" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="000000" />
      <button type="submit">Verify &amp; Activate</button>
    </form>
    <div class="footer">
      This is a one-time setup. You'll need this code on every future login.
    </div>
  </div>
</body>
</html>`;
}
