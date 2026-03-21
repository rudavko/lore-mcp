[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rudavko/lore-mcp)

# LORE

**Linked Object Retrieval Engine** — a personal knowledge server that speaks [MCP](https://modelcontextprotocol.io/).

> Research preview. The API surface may change between versions.

Give all your AI agents the same memory. Store facts, relate them as a knowledge graph, and retrieve them with hybrid search from any MCP-capable client, including [claude.ai](https://claude.ai), [chatgpt.com](https://chatgpt.com), Claude Desktop, and Claude Code. Runs on Cloudflare Workers with zero ongoing cost at personal scale.

## Why

LLM assistants forget everything between sessions. LORE gives your agents a shared, persistent memory they can all read from and write to through MCP. Entries carry provenance (source, actor, confidence) so your agent — or you — can judge how trustworthy a piece of knowledge is.

## One Memory for All Agents

With one deployed LORE endpoint, every connected agent sees the same knowledge base:

- Save something from one client and retrieve it from another.
- Keep context consistent across local apps and web assistants.
- Reduce repeated prompting and re-explaining across tools.

## Capabilities

### Migration Note

The public v0 MCP surface is exactly four tools: `link_object`, `object_create`, `retrieve`, and `engine_check`.

Legacy tool names such as `store`, `update`, `delete`, `query`, `query_graph`, `upsert_entity`, and `resolve_conflict` are not part of the public v0 surface anymore.

### Tools

| Tool | Description |
|---|---|
| `link_object` | Create or update an explicit relationship between stored objects |
| `object_create` | Create a `note` or `entity` with provenance, validity, tags, and optional related links |
| `retrieve` | Unified retrieval across notes, entities, and links with optional link expansion |
| `engine_check` | Help, instance status, history, and ingestion-progress inspection |

### Resources (paginated, cursor-based)

- `knowledge://entries` — all entries
- `knowledge://graph/triples` — all triples
- `knowledge://history/transactions` — transaction log

### Prompts

- `ingest-memory` — guide for storing knowledge with provenance
- `retrieve-context` — guide for unified retrieval, pagination, and link expansion
- `correct-stale-facts` — guide for superseding stale facts and linking objects to `deleted`

## Architecture

```
MCP Client ──► Cloudflare Worker ──► Durable Object (MyMCP)
                     │                      │
                     │                      ├── D1 (SQLite)
                     │                      │    ├── entries + FTS5
                     │                      │    ├── triples
                     │                      │    ├── canonical_entities / aliases
                     │                      │    └── transactions (undo log)
                     │                      │
                     │                      ├── Vectorize (optional, semantic search)
                     │                      └── Workers AI (optional, embeddings)
                     │
                     ├── KV (OAuth state, TOTP secrets, rate-limit counters)
                     └── OAuth 2.1 + TOTP two-factor auth
```

**Retrieval pipeline.** Queries run three signals in parallel and merge them with configurable weights (default 0.3 / 0.5 / 0.2):

1. **Lexical** — FTS5 with BM25 scoring (falls back to LIKE if FTS5 is unavailable)
2. **Semantic** — Vectorize nearest-neighbor over `bge-base-en-v1.5` embeddings (skipped when bindings are absent)
3. **Graph** — 1-hop neighborhood expansion via the triple store

When Vectorize is not bound, semantic weight is redistributed to lexical and graph automatically.

**Unified retrieval.** `retrieve` merges note, entity, and link results into one stream, so the client does not need to predict the right storage type up front.

**Append-only correction model.** Corrections happen by creating a new object and linking it with `supersedes`, or by linking an object to `deleted`, rather than mutating history away.

**Audit trail.** Every mutation records a before/after snapshot in the transaction log. `engine_check` exposes history and ingestion progress from the same public surface.

## Quick Start

### Install on Cloudflare (one click)

1. Click the button and follow the Cloudflare prompts.
2. When prompted for `ACCESS_PASSPHRASE`, create a long, unique passphrase (use a password manager).
3. Finish deploy, then open `https://<your-worker>.workers.dev/authorize`.
4. On first login, scan the TOTP QR code with your authenticator app and verify.
5. Connect your MCP client (see below).

### Connect from Claude Desktop

```json
{
  "mcpServers": {
    "lore": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-worker>.<subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

### Connect from Claude Code

```bash
claude mcp add --transport http lore https://<your-worker>.<subdomain>.workers.dev/mcp
```

### Connect from Web Agents (claude.ai / chatgpt.com)

Use this MCP endpoint in your connector/integration settings:

```text
https://<your-worker>.<subdomain>.workers.dev/mcp
```

Once connected, those agents share the same LORE memory as your desktop and CLI clients.

## Auth

Single-owner, two-factor:

- **Passphrase** — set via `ACCESS_PASSPHRASE` secret
- **Passkey** (WebAuthn) — preferred 2FA, enrolled after first passphrase login
- **TOTP** — fallback 2FA, enrolled via QR code if passkey is skipped

Security details:
- CSRF tokens on all auth forms
- One-time nonces for OAuth requests and enrollment flows (KV with TTL)
- Timing-safe comparison for passphrase and TOTP
- IP-based lockout after 5 failed attempts (15-minute window, shared across all auth methods)
- Security headers: CSP (with nonce for passkey JS), HSTS, X-Frame-Options, no-store

To reset credentials:
```bash
npx wrangler kv key delete --binding OAUTH_KV "ks:passkey:cred"   # reset passkey
npx wrangler kv key delete --binding OAUTH_KV "ks:totp:secret"    # reset TOTP
```

## Local Development

```bash
bun install
cp .dev.vars.example .dev.vars   # set ACCESS_PASSPHRASE in .dev.vars
npx wrangler dev
```

Run tests:
```bash
bun test
```

## Observability

Structured JSON events are emitted via `console.log` and auto-indexed by [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/):

| Event | Fields |
|---|---|
| `mutation` | `op`, `id`, `ok` |
| `retrieval` | `mode`, `results`, `ms` |
| `conflict` | `scope`, `conflict_id` |
| `conflict_resolved` | `conflict_id`, `strategy`, `triple_id` |
| `policy_rejection` | `op`, `reason`, `field` or `confidence` |

## Eval Suite

The evaluation runner is not currently included in this repository snapshot.

See [docs/quality/evals.md](docs/quality/evals.md) for current status before wiring eval commands in CI.

## Updates

Deploy Button forks do not keep the update workflows automatically. The workflow-install admin flow still exists, but it is not currently exposed on the v0 four-tool MCP surface.

**Prerequisites** (one-time setup in your fork's **Settings → Secrets and variables → Actions** after the workflow is installed):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with Workers + D1 edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

If the secrets are missing, the sync still runs but the deploy step is skipped.

See [docs/operations/updates.md](docs/operations/updates.md) for the exact setup path and PAT requirements.

## Project Structure

```
src/
├── index.orch.0.js       # Worker entry orchestration and dependency wiring
├── *.pure.js             # Pure logic (deterministic, no I/O)
├── *.efct.js             # Effect boundaries (I/O, platform APIs)
├── *.ops.efct.js         # Orchestrated effect operations
├── db/
│   ├── schema.efct.js
│   ├── entries.*.js
│   ├── triples.*.js
│   ├── entities.*.js
│   ├── search.*.js
│   ├── conflicts.*.js
│   ├── history.*.js
│   └── summary.*.js
├── domain/
│   ├── conflict.*.js
│   ├── policy.*.js
│   ├── ingestion.*.js
│   └── github-workflow.*.js
├── mcp/
│   ├── tools.*.js
│   ├── resources.efct.js
│   ├── prompts.*.js
│   └── subscriptions.*.js
├── lib/
│   ├── *.pure.js
│   ├── *.efct.js
│   └── *.type.js
├── wiring/
│   ├── runtime.efct.js
│   ├── default-handler.efct.js
│   ├── loremcp.efct.js
│   └── schedule.pure.js
└── templates/
    ├── auth-page.*.js
    ├── enroll-passkey.*.js
    ├── enroll-totp.*.js
    └── install-workflow.*.js
evals/
├── baselines/            # Placeholder directory in current snapshot
└── datasets/             # Placeholder directory in current snapshot
```

## Known Limitations

- **Single-owner only.** One passphrase, one TOTP secret, one user.
- **No multi-tenant isolation.** All data lives in one D1 database.
- **Tag pagination is approximate.** When filtering by tags only (no topic or content), pagination can skip some matches at very low tag selectivity. For exhaustive export, use `knowledge://entries` and filter client-side.
- **Vectorize requires separate setup.** Semantic search only works when AI and Vectorize bindings are configured in wrangler.jsonc.
- **D1 row size limit.** Async ingestion caps content at ~900KB per task. For larger inputs, pre-chunk and create notes individually with `object_create`.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) — free for personal, research, and non-commercial use. See [LICENSE](LICENSE).
