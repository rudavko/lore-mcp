/** @implements NFR-001 — Pure text and error formatting helpers for MCP responses. */
export function textResult(text) {
	return { content: [{ type: "text", text }] };
}
export function errorResult(message) {
	return { content: [{ type: "text", text: message }], isError: true };
}
export function listToText(items) {
	if (items.length === 0) return "(none)";
	return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}
