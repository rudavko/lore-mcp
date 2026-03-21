# ADR 0002: Staleness Detection and Recency-Weighted Ranking

- Status: Proposed
- Date: 2026-03-03
- Drives: NFR-002 (knowledge does not degrade over time)

## Context

As the knowledge base grows from hundreds to thousands of entries, older entries can pollute retrieval results. An entry about "current API version" stored six months ago may still rank highly by semantic similarity even though it is factually outdated.

Today the retrieval pipeline (`src/db/search.ops.efct.ts`) scores results as a fixed weighted sum of lexical (BM25), semantic (cosine similarity), and graph (1-hop neighbor) signals. No temporal signal exists. The schema stores `created_at` and `updated_at` but neither is used in ranking. There is no `last_accessed_at` or access-frequency tracking.

Two distinct problems surface:

1. **Result pollution** — old entries rank alongside fresh ones with no decay.
2. **Staleness detection** — no mechanism to identify entries that may be outdated (never accessed, never updated, created long ago relative to the topic's activity).

## Decision

### 1. Add optional recency weight to the search pipeline

Extend `SearchWeights` in `src/db/search.pure.ts` with an optional `recency` field (default 0, meaning no change to current behavior). When non-zero, compute a time-decay score per entry based on `updated_at` and blend it into the total score alongside lexical/semantic/graph.

Decay function: exponential decay with a configurable half-life (default 90 days). `recency_score = exp(-ln(2) * age_days / half_life)`. This is a pure function — no side effects, testable in isolation.

### 2. Add `last_accessed_at` column to entries table

Track when an entry was last returned in a retrieval result. This enables staleness detection: entries not accessed for N days can be surfaced through `engine_check(status)` (FR-019) or filtered out. Updated via a post-retrieval side effect (batched, not per-row).

### 3. Expose recency parameters in the retrieve tool

Add optional parameters to the `retrieve` MCP tool:
- `recency_weight` (0-1, default 0)
- `recency_half_life_days` (positive integer, default 90)
- `min_updated_after` (ISO date, optional hard filter)

Agents opt in to recency ranking. Existing retrieve calls are unaffected.

## Alternatives Considered

1. **Time-window hard filter only** (e.g., "only entries from last 30 days")
   - Pros: simple to implement.
   - Cons: binary cutoff loses valuable older entries that are still relevant; agents must guess the right window.

2. **Popularity-based ranking** (access count)
   - Pros: surfaces frequently-used entries.
   - Cons: creates feedback loops where popular entries stay popular; does not address actual staleness.

3. **Manual curation / garbage collection**
   - Pros: no system changes needed.
   - Cons: defeats the purpose of autonomous agents; shifts maintenance burden to owner.

## Consequences

Positive:
- Retrieval quality remains stable as entry count grows (NFR-002 scenario 1).
- Agents can detect stale entries via `last_accessed_at` (NFR-002 scenario 2).
- Fully backward-compatible — default recency weight of 0 preserves current behavior.

Tradeoff:
- Schema migration required (`last_accessed_at` column).
- Post-query write to update `last_accessed_at` adds minor latency (mitigated by batching).
- Recency weight introduces a tuning parameter that agents must learn to use effectively.

## Compliance

- Schema change requires D1 migration in `src/db/schema.efct.ts`.
- `computeTotalScore` in `src/db/search.pure.ts` must accept temporal input.
- Retrieve tool parameter schema in `src/mcp/tools.pure.ts` must be extended.
