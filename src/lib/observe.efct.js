/** @implements NFR-001 — Effects boundary for observation and log emission. */
export function logEvent(log, data, std) {
	const serialized = std.json.stringify(data);
	log(serialized.ok ? serialized.value : '{"event":"log_serialize_error"}');
}
