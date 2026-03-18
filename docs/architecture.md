# Architecture

```text
MCP Client --> Cloudflare Worker --> Durable Object (MyMCP)
                     |                      |
                     |                      |-- D1 (SQLite)
                     |                      |   |-- entries + FTS5
                     |                      |   |-- triples
                     |                      |   |-- canonical_entities / aliases
                     |                      |   '-- transactions (undo log)
                     |                      |
                     |                      |-- Vectorize (optional, semantic search)
                     |                      '-- Workers AI (optional, embeddings)
                     |
                     |-- KV (OAuth state, TOTP secrets, rate-limit counters)
                     '-- OAuth 2.1 + TOTP two-factor auth
```

## Retrieval Pipeline

Queries run three signals in parallel and merge with configurable weights (default `0.3 / 0.5 / 0.2`):

1. Lexical - FTS5 with BM25 scoring (falls back to `LIKE` if FTS5 is unavailable)
2. Semantic - Vectorize nearest-neighbor over `bge-base-en-v1.5` embeddings (skipped when bindings are absent)
3. Graph - 1-hop neighborhood expansion via the triple store

When Vectorize is not bound, semantic weight is redistributed to lexical and graph.

## Conflict Detection

If `relate` would create the same subject+predicate with a different object, LORE returns `ConflictInfo` and waits for `resolve_conflict`.

## Undo Model

Every mutation stores before/after snapshots in the transaction log. `undo` replays the inverse operation, including entity merge reversal.
