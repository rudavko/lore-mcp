/** @implements FR-011, NFR-001 — Effects boundary for WebAuthn challenge and credential KV persistence. */
/** Sentinel for TDD hook. */
export const _MODULE = "webauthn.efct";
/** Read a raw string from KV. */
export async function kvGet(kv, key) {
	return kv.get(key);
}
/** Write a raw string to KV. */
export async function kvPut(kv, key, value) {
	await kv.put(key, value);
}
/** Write a raw string to KV with TTL. */
export async function kvPutTtl(kv, key, value, expirationTtl) {
	await kv.put(key, value, { expirationTtl });
}
/** Delete a KV key. */
export async function kvDelete(kv, key) {
	const deleter = kv.delete.bind(kv);
	await deleter(key);
}
/** Parse a JSON string. */
export function parseJson(text, std) {
	const parsed = std.json.parse(text);
	return parsed.ok ? parsed.value : null;
}
/** Serialize a value to JSON. */
export function toJson(value, std) {
	const serialized = std.json.stringify(value);
	return serialized.ok ? serialized.value : "null";
}
