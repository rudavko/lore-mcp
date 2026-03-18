/** @implements FR-001 — Cursor encode/decode helpers for runtime wiring. */
function decodeCursor(raw, std) {
	if (!raw) {
		return null;
	}
	try {
		const decoded = std.atob(raw);
		return decoded || null;
	} catch {
		return null;
	}
}

function encodeCursor(value, std) {
	return std.btoa(value);
}

export { decodeCursor, encodeCursor };
