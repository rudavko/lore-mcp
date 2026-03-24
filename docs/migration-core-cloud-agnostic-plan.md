# Migration Plan: `lore-mcp` to Cloud-Agnostic Core

## Goal

Grounded:
- The current system is deployed as a Cloudflare Worker with a Durable Object, D1, KV, Workers AI, and Vectorize. See [architecture.md](./architecture.md), [wrangler.jsonc](../wrangler.jsonc), [src/index-worker-services.orch.2.js](../src/index-worker-services.orch.2.js), [src/wiring/default-handler-request-context.orch.2.js](../src/wiring/default-handler-request-context.orch.2.js), and [src/wiring/runtime-search.orch.3.js](../src/wiring/runtime-search.orch.3.js).
- The current codebase already contains a large portable nucleus: most files under `src/db`, `src/domain`, `src/lib`, `src/mcp`, `src/templates`, and pure auth/TOTP/WebAuthn logic score low on Cloudflare coupling in [cloudflare-coupling-inventory.tsv](./cloudflare-coupling-inventory.tsv).

Assumption:
- The target is not “no adapters anywhere”; it is “`lore-mcp-core` has zero Cloudflare coupling, while `lore-mcp-cloudflare` owns Cloudflare-specific transport, auth, storage bindings, and deployment shape”, I assume.

## Current C4 Container List

Grounded from [architecture.md](./architecture.md), [src/index-core.orch.1.js](../src/index-core.orch.1.js), [src/index-worker-services.orch.2.js](../src/index-worker-services.orch.2.js), and [src/wiring/default-handler-routes.orch.2.js](../src/wiring/default-handler-routes.orch.2.js):

1. MCP Client
2. Browser user for auth/admin flows
3. Cloudflare Worker HTTP surface
4. Durable Object `LoreMcp` / MCP runtime
5. D1 database
6. KV namespace for OAuth/auth state
7. Workers AI for embeddings
8. Vectorize index for semantic search
9. GitHub API for install-workflow writes

## Current C4 Component List

Grounded from current composition roots and wiring:

1. Worker transport assembly
   - `src/index.js`
   - `src/index.orch.0.js`
   - `src/index-core.orch.1.js`
   - `src/index-worker-services.orch.2.js`

2. Default HTTP handler for auth/admin/browser routes
   - `src/index-default-handler-services.orch.2.js`
   - `src/wiring/default-handler.orch.1.js`
   - `src/wiring/default-handler-routes.orch.2.js`
   - `src/wiring/default-handler-request-context.orch.2.js`
   - `src/wiring/default-handler-auth-adapter.orch.3.js`
   - `src/wiring/default-handler-admin-adapter.orch.3.js`
   - `src/wiring/default-handler-config.orch.3.js`

3. MCP server configuration/runtime assembly
   - `src/index-runtime-services.orch.2.js`
   - `src/wiring/runtime-configure-server.orch.3.js`
   - `src/wiring/runtime-configure-core.orch.3.js`
   - `src/wiring/runtime-configure-runtime-ops.orch.3.js`
   - `src/wiring/runtime-server-registration.orch.3.js`
   - `src/wiring/runtime-tools-deps.orch.3.js`

4. Entry/triple/entity/history runtime operations
   - `src/wiring/runtime-entry-triple.orch.3.js`
   - `src/wiring/runtime-entity-history.orch.3.js`
   - `src/wiring/runtime-resolve-entity.orch.4.js`
   - `src/wiring/runtime-configure-conflicts.orch.4.js`

5. Hybrid retrieval and embedding orchestration
   - `src/wiring/runtime-search.orch.3.js`
   - `src/wiring/runtime-search-fallback.orch.4.js`
   - `src/wiring/runtime-graph-expand.orch.3.js`
   - `src/wiring/runtime-tools-embedding.orch.4.js`

6. Ingestion orchestration
   - `src/wiring/runtime-ingestion.orch.3.js`
   - `src/wiring/runtime-configure-ingestion.orch.4.js`
   - `src/wiring/runtime-run-ingestion.orch.3.js`
   - `src/wiring/loremcp.efct.js`

7. Persistence layer
   - `src/db/**`

8. Domain logic
   - `src/domain/**`

9. MCP tool/resource/prompt definitions
   - `src/mcp/**`

10. Auth/TOTP/WebAuthn logic and HTML templates
   - `src/auth*.js`
   - `src/totp.pure.js`
   - `src/webauthn.*.js`
   - `src/templates/**`

## Target C4 Container List

Assumption:

1. MCP Client
2. Browser user for auth/admin flows, I assume
3. `lore-mcp-cloudflare` Worker shell, I assume
4. `lore-mcp-core` package loaded inside the shell, I assume
5. Storage adapter implementation
   - Cloudflare adapter at first
   - later other implementations, I assume
6. Auth/session adapter implementation, I assume
7. Embedding/vector adapter implementation, I assume
8. GitHub updater/integration adapter, I assume

The key change is that external services move behind adapter interfaces owned by core, I assume.

## Target C4 Component List

Assumption:

1. Transport adapter
   - HTTP/MCP request ingress
   - SSE/stream compatibility
   - current Cloudflare Worker shell first, I assume

2. Auth web adapter
   - browser auth/admin routes
   - passkey/TOTP UI flow adapters
   - current Cloudflare/KV-backed implementation first, I assume

3. Core application service
   - configure server
   - register tools/resources/prompts
   - format results/errors
   - policy enforcement, I assume

4. Knowledge service
   - entry/triple/entity/history use cases, I assume

5. Retrieval service
   - lexical retrieval
   - semantic retrieval
   - graph expansion
   - score fusion/cursors, I assume

6. Ingestion service
   - sync/async ingest
   - embedding retries
   - rescheduling policy, I assume

7. Persistence ports
   - relational store port
   - transaction log port
   - conflict store port, I assume

8. Auth/session ports
   - client lookup/auth request completion
   - key-value/session/lockout store
   - challenge/credential store, I assume

9. Embedding/vector ports
   - embedding generation
   - vector upsert/query/delete, I assume

10. Admin/update ports
   - target repo resolution
   - workflow installation/update
   - signed setup token issuance/verification, I assume

## Migration Strategy

### Phase 1: Freeze the Core Boundary

Grounded:
- The low-coupling inventory already identifies the portable nucleus in [cloudflare-coupling-inventory.tsv](./cloudflare-coupling-inventory.tsv).

Actions:
1. Declare `lore-mcp-core` as owning:
   - `src/db/**`
   - `src/domain/**`
   - `src/lib/**`
   - `src/mcp/**`
   - `src/templates/**`
   - `src/totp.pure.js`
   - `src/webauthn.pure.js`
   - most `src/auth-*.js` pure/orchestration files that do not read Cloudflare env directly
2. Freeze Cloudflare-only ownership to:
   - `wrangler.jsonc`
   - `worker-configuration.d.ts`
   - `public/**`
   - `migrations/**`
   - deploy scripts
   - top-level Worker entrypoints
   - Worker env/binding adapters

### Phase 2: Introduce Explicit Ports

Grounded:
- Current coupling hotspots are env/binding reads in:
  - `src/wiring/default-handler-request-context.orch.2.js`
  - `src/wiring/default-handler-auth-adapter.orch.3.js`
  - `src/wiring/default-handler-admin-adapter.orch.3.js`
  - `src/wiring/runtime-search.orch.3.js`
  - `src/wiring/runtime-tools-deps.orch.3.js`
  - `src/wiring/runtime-configure-runtime-ops.orch.3.js`

Actions:
1. Define a relational DB port from the current D1-shaped contract already used by `src/db/*.efct.js`.
2. Define a KV/session port for:
   - OAuth state
   - rate limiting
   - passkey/TOTP state
   - one-time auto-update setup links
3. Define an embedding provider port.
4. Define a vector index port.
5. Define an auth provider port for:
   - `parseAuthRequest`
   - `lookupClient`
   - `completeAuthorization`
6. Define a request-context port so auth/admin route code stops reading `CF-Connecting-IP` and raw Worker env directly.

### Phase 3: Move Core Runtime Construction Behind Ports

Actions:
1. Refactor `src/wiring/runtime-configure-runtime-ops.orch.3.js` to consume ports instead of `env.DB`, `env.AI`, and `env.VECTORIZE_INDEX`.
2. Refactor `src/wiring/runtime-search.orch.3.js` so lexical/graph search stays in core while semantic/vector operations come through ports.
3. Refactor `src/wiring/runtime-run-ingestion.orch.3.js` and `src/wiring/runtime-tools-embedding.orch.4.js` to consume embedding/vector ports.
4. Refactor `src/wiring/loremcp.efct.js` so scheduling becomes an injected scheduler port instead of an instance-specific Cloudflare assumption.

### Phase 4: Split Auth/Admin Surface

Actions:
1. Move `src/auth.orch.1.js`, `src/admin.orch.1.js`, templates, and pure auth/TOTP/WebAuthn logic into core.
2. Keep only Cloudflare request/env/session adapters in the Cloudflare shell.
3. Replace direct `envRec.OAUTH_KV`, `envRec.ACCESS_PASSPHRASE`, and `CF-Connecting-IP` access with injected request/auth/session services.

### Phase 5: Extract Cloudflare Shell

Actions:
1. Rename `lore-mcp-shell` to `lore-mcp-cloudflare`.
2. Move into it:
   - Worker entrypoints
   - Wrangler config
   - generated worker types
   - public assets
   - migrations
   - deploy/typegen scripts
   - Cloudflare adapter implementations
3. Replace the current sibling-path bridge with a real dependency on `lore-mcp-core`.

### Phase 6: Make Core Consumable

Actions:
1. Give `lore-mcp-core` a narrow public API:
   - `createLoreMcpCore(...)`, I assume
   - `createAuthRoutes(...)`, I assume
   - `createAdminRoutes(...)`, I assume
   - port type exports, I assume
2. Keep `private: true` during refactor.
3. Once the seam is stable:
   - either publish to npm
   - or depend on GitHub tags/commits first

Grounded:
- npm docs support Git URLs and GitHub URLs as dependencies.
- npm docs also state `private: true` prevents publish.

### Phase 7: Drive Scores Down

Target score movement, assumption:
- `7-10` files move into `lore-mcp-cloudflare`, I assume
- `4-6` files are refactored into core-plus-adapters, I assume
- `0-3` files remain in `lore-mcp-core`, I assume

The success condition is:
- `lore-mcp-core` contains only `0-3` files, I assume
- `lore-mcp-cloudflare` owns the remaining Cloudflare-specific files, I assume

## Move Order: Core Modules First

Grounded first-cut move order:

1. Leave these in core immediately:
   - `src/db/**`
   - `src/domain/**`
   - `src/lib/**`
   - `src/mcp/**`
   - `src/templates/**`
   - `src/totp.pure.js`
   - `src/webauthn.pure.js`

2. Refactor these next to become core-facing, adapter-driven modules:
   - `src/wiring/runtime-configure-runtime-ops.orch.3.js`
   - `src/wiring/runtime-search.orch.3.js`
   - `src/wiring/runtime-run-ingestion.orch.3.js`
   - `src/wiring/runtime-tools-deps.orch.3.js`
   - `src/wiring/default-handler-request-context.orch.2.js`
   - `src/wiring/default-handler-auth-adapter.orch.3.js`
   - `src/wiring/default-handler-admin-adapter.orch.3.js`

3. Move these last into the Cloudflare shell:
   - `src/index.js`
   - `src/index.orch.0.js`
   - `src/index-core.orch.1.js`
   - `src/index-default-handler-services.orch.2.js`
   - `src/index-worker-services.orch.2.js`
   - `src/wiring/mcp-agent.efct.js`
   - `src/wiring/mcp-api-handler.efct.js`
   - `wrangler.jsonc`
   - `worker-configuration.d.ts`
   - `public/**`
   - `migrations/**`
   - Cloudflare deploy scripts

## Risks

Grounded:
- The highest hidden coupling today is not DB SQL; it is runtime env/binding access and Worker transport assembly.
- Tests currently encode a lot of Worker/KV assumptions, especially in auth and wiring tests.

Assumption:
- The main refactor cost will be replacing implicit `env` reads with explicit ports, not rewriting business logic, I assume.
- The DB layer should be one of the easier subsystems to keep in core because it already targets a small generic interface, I assume.
