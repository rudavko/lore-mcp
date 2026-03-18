/** @implements NFR-001 — Shared pure helpers for HTML template rendering. */
/** Sentinel for TDD hook. */
export const _MODULE = "template-helpers.pure";

export function escapeHtml(value) {
	const text = typeof value === "string" ? value : `${value ?? ""}`;
	let result = "";
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "&") {
			result += "&amp;";
		} else if (ch === "<") {
			result += "&lt;";
		} else if (ch === ">") {
			result += "&gt;";
		} else if (ch === '"') {
			result += "&quot;";
		} else if (ch === "'") {
			result += "&#39;";
		} else {
			result += ch;
		}
	}
	return result;
}

export function renderHtmlDocument(input) {
	return (
		'<!DOCTYPE html><html lang="en"><head>' +
		'<meta charset="UTF-8" />' +
		'<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
		"<title>" +
		escapeHtml(input.title) +
		"</title>" +
		'<link rel="icon" href="/favicon.ico" sizes="32x32" />' +
		"<style>" +
		input.css +
		"</style></head><body>" +
		input.bodyHtml +
		"</body></html>"
	);
}
