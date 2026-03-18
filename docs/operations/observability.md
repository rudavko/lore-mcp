# Observability

Structured JSON events are emitted via `console.log` and indexed by [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/).

| Event | Fields |
|---|---|
| `mutation` | `op`, `id`, `ok` |
| `retrieval` | `mode`, `results`, `ms` |
| `conflict` | `scope`, `conflict_id` |
| `conflict_resolved` | `conflict_id`, `strategy`, `triple_id` |
| `policy_rejection` | `op`, `reason`, `field` or `confidence` |
