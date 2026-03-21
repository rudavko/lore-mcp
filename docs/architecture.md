# Architecture

```text
MCP Client --> Cloudflare Worker --> Durable Object (MyMCP)
                     |                      |
                     |                      |-- D1 (SQLite)
                     |                      |   |-- entries + FTS5
                     |                      |   |-- triples
                     |                      |   |-- canonical_entities / aliases
                     |                      |   '-- transactions (audit log)
                     |                      |
                     |                      |-- Vectorize (optional, semantic search)
                     |                      '-- Workers AI (optional, embeddings)
                     |
                     |-- KV (OAuth state, TOTP secrets, rate-limit counters)
                     '-- OAuth 2.1 + TOTP two-factor auth
```

## Retrieval Pipeline

`retrieve` is a unified heterogeneous query path. It runs note retrieval,
entity lookup, and link lookup in parallel, normalizes the results into one
mixed stream, applies optional `as_of` filtering, sorts by total score, and
paginates with a composite cursor.

Note retrieval uses three signals with configurable weights (default
`0.3 / 0.5 / 0.2`):

1. Lexical - FTS5 with BM25 scoring (falls back to `LIKE` if FTS5 is unavailable)
2. Semantic - Vectorize nearest-neighbor over `bge-base-en-v1.5` embeddings (skipped when bindings are absent)
3. Graph - 1-hop neighborhood expansion via the triple store

Entity retrieval matches canonical names and aliases. Link retrieval matches
stored triples by subject, predicate, and object. When Vectorize is not
bound, semantic weight is redistributed to lexical and graph. When
`include_links=true`, `retrieve` attaches explicit stored links for returned
objects. When `include_auto_links=true`, it attaches supported engine-derived
links.

## Link Mutation Semantics

`link_object` is the public link-mutation path. It delegates directly to
triple upsert logic and returns the resulting stored link. The public v0
surface does not expose a separate conflict-resolution tool.

## Audit Model

Every public mutation stores before and after snapshots in the transaction
log. The public inspection path is `engine_check(action="history")`, which
exposes mutation history as an audit surface. The transaction log is a system
guarantee even when no standalone public undo tool is exposed.
