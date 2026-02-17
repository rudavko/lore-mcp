// Structured observability events for Cloudflare Workers Logs.
// Workers automatically extracts and indexes JSON fields from console.log.

export function logEvent(event: string, data: Record<string, unknown>) {
	console.log(JSON.stringify({ event, ts: Date.now(), ...data }));
}
