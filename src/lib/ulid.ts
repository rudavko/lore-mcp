// --- Monotonic ULID Generator (no deps) ---
// Per the ULID spec, when multiple IDs are generated in the same
// millisecond, the random component is incremented to guarantee
// sort order matches generation order.
//
// Module-level state (lastTime, lastRandom) is safe because this runs
// inside a Durable Object which guarantees single-threaded execution.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number, len: number): string {
	let str = "";
	for (let i = len; i > 0; i--) {
		str = CROCKFORD[now & 31] + str;
		now = Math.floor(now / 32);
	}
	return str;
}

let lastTime = 0;
let lastRandom = new Uint8Array(16);

export function ulid(): string {
	const now = Date.now();
	if (now === lastTime) {
		// Increment the random component (big-endian) for monotonicity.
		// On full overflow (all 16 bytes wrap to 0), force a new timestamp
		// to avoid duplicate IDs.
		let overflowed = true;
		for (let i = 15; i >= 0; i--) {
			lastRandom[i] = (lastRandom[i] + 1) & 31;
			if (lastRandom[i] !== 0) { overflowed = false; break; }
		}
		if (overflowed) lastTime = 0;
	} else {
		lastTime = now;
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		for (let i = 0; i < 16; i++) lastRandom[i] = bytes[i] & 31;
	}
	let rand = "";
	for (let i = 0; i < 16; i++) rand += CROCKFORD[lastRandom[i]];
	return encodeTime(now, 10) + rand;
}

// SQLite-compatible datetime with millisecond precision for correct ordering.
// Uses "YYYY-MM-DD HH:MM:SS.mmm" which SQLite compares lexicographically.
export function sqliteNow(): string {
	return new Date().toISOString().replace("T", " ").replace("Z", "");
}
