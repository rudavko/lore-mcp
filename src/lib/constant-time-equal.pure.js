/** @implements NFR-001 — Shared constant-time-ish string comparison helper for auth and token verification. */
export function safeStringEqual(left, right, deps) {
	const encoder = new deps.textEncoderCtor();
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	let diff = leftBytes.length === rightBytes.length ? 0 : 1;
	const maxLen = leftBytes.length > rightBytes.length ? leftBytes.length : rightBytes.length;
	for (let i = 0; i < maxLen; i++) {
		if ((leftBytes[i] ?? 0) !== (rightBytes[i] ?? 0)) {
			diff += 1;
		}
	}
	return diff === 0;
}
