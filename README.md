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

### Tools

| Tool | Description |
|---|---|
| `store` | Create a knowledge entry with optional provenance |
| `update` | Update an existing entry |
| `query` | Hybrid search: FTS5 lexical + Vectorize semantic + graph expansion (combines `topic` + `content` when both are provided) |
| `delete` | Soft-delete an entry or triple |
| `relate` | Create a graph triple with conflict detection |
| `query_graph` | Query triples by subject / predicate / object with cursor pagination |
| `update_triple` | Update an existing triple |
| `upsert_triple` | Create-or-update a triple by subject+predicate |
| `resolve_conflict` | Resolve a detected triple conflict (replace / retain_both / reject) |
| `upsert_entity` | Create or resolve a canonical entity by name |
| `merge_entities` | Merge two canonical entities |
| `undo` | Revert recent transactions |
| `history` | View transaction history with cursor pagination |
| `ingest` | Bulk-ingest text (sync for small inputs, async for large) |
| `ingestion_status` | Check async ingestion progress |
| `time` | Current time in any IANA timezone |

### Resources (paginated, cursor-based)

- `knowledge://entries` — all entries
- `knowledge://graph/triples` — all triples
- `knowledge://history/transactions` — transaction log

### Prompts

- `ingest-memory` — guide for storing knowledge with provenance
- `retrieve-context` — guide for querying with filters and scoring
- `correct-stale-facts` — guide for finding and updating outdated facts

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

**Conflict detection.** When `relate` would create a triple with the same subject+predicate but a different object, LORE pauses and returns a `ConflictInfo` for the client to resolve via `resolve_conflict`.

**Undo.** Every mutation records a before/after snapshot in the transaction log. `undo` replays the inverse, including full reversal of entity merges.

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
- **Cloudflare Access** (optional) — adds an email-based identity layer with JWT verification

### Optional: Email OAuth (Cloudflare Access)

If you want email-based OAuth on top of passphrase + 2FA:

1. Create a Cloudflare Access application for your Worker URL.
2. Add these Worker secrets:
   - `CF_ACCESS_TEAM_DOMAIN` (your Access team subdomain, without `.cloudflareaccess.com`)
   - `CF_ACCESS_AUD` (the Access app audience/tag)
3. (Recommended) Add `OWNER_EMAIL` to lock access to one email address.

If `OWNER_EMAIL` is not set, any email that passes your Cloudflare Access policy can sign in.

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

```bash
bun run evals/run.ts
```

Seeds 30 entries + 12 triples, runs 12 queries, and computes ndcg@10, mrr@10, recall@20, and latency p95. CI fails if metrics regress beyond thresholds.

Baseline (FTS5-only, no Vectorize): ndcg=0.38, mrr=0.66, recall=0.29. Semantic search via Vectorize is expected to close the gap on the 4 deliberate misses in the eval set.

## Updates

[![Update from Source](https://img.shields.io/badge/Update_from_Source-blue?logo=github)](../../actions/workflows/manual-update.yml)

Click the badge above (or go to **Actions → Manual Update → Run workflow**) to pull the latest version from upstream and redeploy.

**Prerequisites** (one-time setup in your fork's **Settings → Secrets and variables → Actions**):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with Workers + D1 edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

If the secrets are missing, the sync still runs but the deploy step is skipped.

Two workflows are included:

- **Manual Update** — click "Run workflow" to force-sync from upstream and redeploy
- **Auto Update Control** (opt-in) — enable/disable daily scheduled upstream sync

## Project Structure

```
src/
├── index.ts              # Worker entry, Durable Object, OAuth provider
├── auth.ts               # Hono routes: /authorize, /approve, /enroll-totp, /enroll-passkey
├── cf-access.ts          # Cloudflare Access JWT verification (zero-dep)
├── totp.ts               # TOTP/HOTP via Web Crypto (zero-dep, RFC 4226/6238)
├── webauthn.ts           # Passkey/WebAuthn verification (via @simplewebauthn/server)
├── db/
│   ├── schema.ts         # D1 schema init + FTS5 virtual table + triggers
│   ├── entries.ts        # Entry CRUD with transaction logging
│   ├── triples.ts        # Triple CRUD with transaction logging
│   ├── entities.ts       # Canonical entity management + merge
│   ├── search.ts         # Hybrid retrieval: lexical + semantic + graph
│   └── history.ts        # Undo engine (supports merge reversal)
├── domain/
│   ├── conflict.ts       # Advisory conflict detection for triples
│   ├── policy.ts         # Mutation guardrails (required fields, min confidence)
│   └── ingestion.ts      # Sync/async bulk ingestion with dedup
├── mcp/
│   ├── tools.ts          # All 16 MCP tool registrations
│   ├── resources.ts      # Paginated resource handlers
│   ├── prompts.ts        # Prompt templates
│   └── subscriptions.ts  # Change notification via resources/updated
├── lib/
│   ├── types.ts          # Shared interfaces
│   ├── errors.ts         # Structured error codes
│   ├── format.ts         # Tool response formatting + cursor helpers
│   ├── observe.ts        # Structured event logging
│   └── ulid.ts           # Monotonic ULID generator (zero-dep)
└── templates/
    ├── authorize.ts      # Auth page HTML (passkey auto-trigger + passphrase fallback)
    ├── enroll-passkey.ts # Passkey enrollment page HTML
    └── enroll-totp.ts    # TOTP enrollment page HTML
evals/
├── run.ts                # Retrieval eval runner
├── metrics.ts            # ndcg, mrr, recall, latency computation
├── metrics.test.ts       # Metric function tests
├── smoke-vectorize.ts    # Live Vectorize smoke test
└── smoke-totp.ts         # TOTP smoke test
```

## Known Limitations

- **Single-owner only.** One passphrase, one TOTP secret, one user.
- **No multi-tenant isolation.** All data lives in one D1 database.
- **Tag pagination is approximate.** When filtering by tags only (no topic or content), pagination can skip some matches at very low tag selectivity. For exhaustive export, use `knowledge://entries` and filter client-side.
- **Vectorize requires separate setup.** Semantic search only works when AI and Vectorize bindings are configured in wrangler.jsonc.
- **D1 row size limit.** Async ingestion caps content at ~900KB per task. For larger inputs, pre-chunk and call `store` individually.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) — free for personal, research, and non-commercial use. See [LICENSE](LICENSE).
