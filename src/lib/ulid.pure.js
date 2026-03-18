/** @implements NFR-001 — ULID formatting (pure computation, no globals). */
export function formatUlid(now, randomBytes) {
	const encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	let remaining = now;
	const time = Array.from({ length: 10 }, () => {
		const remainder = remaining % 32;
		const character = encoding[remainder];
		remaining = (remaining - remainder) / 32;
		return character;
	})
		.reverse()
		.join("");
	const rand = Array.from(randomBytes, (byte) => encoding[byte % 32]).join("");
	return time + rand;
}
