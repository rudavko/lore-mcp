/** @implements NFR-001 — Shared HTML scraping helpers for route and E2E tests. */
function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractHiddenInputValue(html, fieldName) {
	const match = html.match(new RegExp(`name="${fieldName}" value="([^"]+)"`));
	return match ? match[1] : "";
}

export function extractHref(html, pathPrefix) {
	const pattern = new RegExp(`href="(${escapeRegex(pathPrefix)}[^"]*)"`);
	const match = html.match(pattern);
	return match ? match[1] : "";
}

export function extractSecretDisplay(html) {
	const match = html.match(/<code>([^<]+)<\/code>/);
	return match ? match[1].replace(/\s+/g, "") : "";
}
