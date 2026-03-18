# ADR 0003: Embedding Versioning Strategy

- Status: Proposed
- Date: 2026-03-03
- Drives: NFR-004 (embedding model change does not break retrieval)

## Context

The system uses Cloudflare Workers AI model `@cf/baai/bge-base-en-v1.5` (768 dimensions) for semantic search. The model ID is hardcoded as a string literal in two places:
- `src/wiring/runtime.efct.ts:554` (query-time embedding)
- `src/db/search.ops.efct.ts:84` (index-time embedding via `syncEmbedding`)

Vectors are stored in Cloudflare Vectorize with only `{ id, values }` — no metadata about which model produced the embedding, when it was created, or the content hash at embedding time.

If Cloudflare updates, replaces, or retires `bge-base-en-v1.5`:
- Old vectors remain in the index with incompatible representations.
- New query vectors are produced by the new model.
- Cosine similarity between old and new vectors is meaningless.
- Semantic search silently degrades with no error or warning.
- There is no way to identify which vectors need re-embedding.

Cloudflare Vectorize supports per-vector metadata (cf. `worker-configuration.d.ts`), but this capability is currently unused.

## Decision

### 1. Store embedding model ID as vector metadata

When upserting vectors via `syncEmbedding`, include metadata:
```
{ id, values, metadata: { model: "@cf/baai/bge-base-en-v1.5", embedded_at: <ISO> } }
```

This makes every vector self-describing. Cost: negligible (metadata is small).

### 2. Extract model ID to configuration constant

Replace the two hardcoded string literals with a single constant (e.g., `EMBEDDING_MODEL_ID` in `src/config.pure.ts`). This makes model changes a single-point edit.

### 3. Detect model mismatch at query time

Before executing semantic search, compare the configured model ID against the metadata of returned vectors. If a mismatch is detected:
- Log a warning via the observe layer.
- Exclude mismatched vectors from semantic scoring (degrade gracefully to lexical + graph).
- Include a `degraded: true` flag in the query response so agents know semantic results are incomplete.

This satisfies NFR-004's measure: "semantic search either works correctly with new model or degrades gracefully to lexical+graph only."

### 4. Provide a re-embedding admin operation

Add an admin-only operation (not exposed as an MCP tool) that:
- Queries all entries where vector metadata model != current model.
- Re-embeds content with the current model.
- Upserts updated vectors with new metadata.
- Processes in batches to stay within Workers CPU limits.

This is the migration path when a model change is intentional.

## Alternatives Considered

1. **Dual-index strategy** (maintain two Vectorize indexes during migration)
   - Pros: zero-downtime transition, query both indexes.
   - Cons: doubles Vectorize cost, complex query merging, Cloudflare may limit index count per account.

2. **Content hash comparison** (re-embed entries whose content changed)
   - Pros: catches content edits that invalidate embeddings.
   - Cons: does not address model changes; orthogonal concern.

3. **Ignore the problem** (assume model never changes)
   - Pros: no work.
   - Cons: Cloudflare has changed Workers AI models before; silent degradation violates NFR-004.

## Consequences

Positive:
- Every vector is self-describing — can always determine which model produced it.
- Silent degradation eliminated — system detects and reports model mismatches.
- Graceful degradation path exists (lexical + graph) while re-embedding proceeds.
- Model change becomes an operational procedure, not an emergency.

Tradeoff:
- Per-vector metadata increases storage marginally.
- Mismatch detection adds one metadata comparison per query (negligible).
- Re-embedding is a batch operation that consumes Workers AI quota.
- Admin re-embedding operation must be carefully rate-limited to avoid quota exhaustion.

## Compliance

- `syncEmbedding` in `src/db/search.ops.efct.ts` must include metadata in vector upsert.
- Model constant must be centralized in `src/config.pure.ts`.
- Semantic search in `src/wiring/runtime.efct.ts` must filter by model metadata.
- Admin re-embedding must be added (likely `src/admin.efct.ts`).
