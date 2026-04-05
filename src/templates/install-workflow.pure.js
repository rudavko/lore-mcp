/** @implements NFR-001 — Pure install-workflow HTML template: GitHub Actions workflow installer. */
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
.field { margin-bottom: 1rem; }
label { display: block; font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.55rem; }
input[type="password"], input[type="text"] { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 0.95rem; font-family: 'SF Mono','Fira Code',monospace; color: #fff; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; }
input:focus { border-color: rgba(124,58,237,0.6); background: rgba(255,255,255,0.09); }
.repo-box { display: block; width: 100%; padding: 0.85rem 1rem; font-size: 0.95rem; font-family: 'SF Mono','Fira Code',monospace; color: #fff; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }
button[type="submit"] { display: block; width: 100%; margin-top: 1.25rem; padding: 0.85rem 1.5rem; font-size: 0.95rem; font-weight: 600; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
.banner { padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.25rem; }
.banner.success { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: rgba(16,185,129,0.9); }
.banner.success a { color: rgba(16,185,129,1); text-decoration: underline; }
.banner.error { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: rgba(239,68,68,0.9); }
.footer { margin-top: 1.25rem; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`;
function renderBanner(p) {
	if (p.result && p.result.ok) {
			let warning = "";
			if (typeof p.result.warning === "string" && p.result.warning.length > 0) {
				warning = '<div class="banner error">' + escapeHtml(p.result.warning) + "</div>";
			}
		if (p.result.action === "unchanged") {
			return warning + '<div class="banner success">Workflow is already up to date.</div>';
		}
		let link = "";
		if (p.result.commitUrl) {
			link =
				' <a href="' +
					escapeHtml(p.result.commitUrl) +
				'" target="_blank" rel="noopener noreferrer">View commit</a>';
		}
		const action = p.result.action ? p.result.action : "installed";
		return (
			warning +
			'<div class="banner success">Workflow ' +
				escapeHtml(action) +
			" successfully." +
			link +
			"</div>"
		);
	}
	if (p.result) {
		const msg = p.result.error ? p.result.error : "Unknown error";
			return '<div class="banner error">Installation failed: ' + escapeHtml(msg) + "</div>";
		}
		if (p.error) {
			return '<div class="banner error">' + escapeHtml(p.error) + "</div>";
		}
	return "";
}
/** Render the install-workflow admin page as an HTML string. */
export function renderInstallWorkflowPage(p) {
	const banner = renderBanner(p);
	const canSubmit = typeof p.setupToken === "string" && p.setupToken.length > 0;
	const hasFixedRepo = typeof p.defaultRepo === "string" && p.defaultRepo.length > 0;
	const repoLabel = hasFixedRepo ? "Target repository" : "Target repository verification";
	const repoValue = hasFixedRepo
		? p.defaultRepo
		: "This install link is pinned to the deployed build branch and commit. Use a fine-grained PAT scoped to exactly one deploy repo and the installer will verify that repo before writing the workflow.";
	const form =
		(canSubmit
			? '<form action="/admin/install-workflow" method="POST">' +
					'<input type="hidden" name="csrf_token" value="' +
					escapeHtml(p.csrfToken) +
					'" />' +
					'<input type="hidden" name="setup_token" value="' +
					escapeHtml(p.setupToken) +
					'" />' +
					'<div class="field"><label>' +
					escapeHtml(repoLabel) +
					"</label>" +
					'<div class="repo-box">' +
					escapeHtml(repoValue) +
					"</div></div>" +
				'<div class="field"><label for="github_pat">GitHub PAT</label>' +
				'<input id="github_pat" type="password" name="github_pat" required autocomplete="off" placeholder="Paste fine-grained PAT" /></div>' +
				'<button type="submit">Install Workflow</button>' +
				"</form>"
			: "") +
		"";
	const footer = canSubmit
		? (hasFixedRepo
			? "This setup link is short-lived and scoped to the repository shown above. The PAT is used once and is not stored."
			: "This setup link is short-lived. Use a fine-grained PAT scoped to exactly one deploy repo with Metadata: read, Contents: read and write, and Workflows: read and write. The PAT is used once and is not stored.")
		: "Generate a fresh one-time link with the enable_auto_updates MCP tool if you need to retry.";
	return renderHtmlDocument({
		title: "Install Workflow — Lore Admin",
		css: CSS,
		bodyHtml:
			'<div class="bg" aria-hidden="true"><div class="orb"></div><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>' +
			'<div class="card">' +
			'<div class="header">' +
			'<div class="icon" aria-hidden="true">&#9881;</div>' +
			'<h1 class="title">Install Workflow</h1>' +
			'<p class="subtitle">Install the upstream-sync GitHub Actions workflow into a deploy repository.</p></div>' +
			banner +
			form +
			'<div class="footer">' +
			footer +
			"</div>" +
			"</div>",
	});
}
