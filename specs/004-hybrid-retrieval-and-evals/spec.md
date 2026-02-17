# Spec 004: Hybrid Retrieval, Async Ingestion, and Quality Evals

## Problem Statement

Current retrieval relies on substring matching and does not provide robust long-horizon memory quality, ranking controls, or objective regression checks for agentic performance.

## Goals

1. Add hybrid retrieval combining lexical, embedding, and graph neighborhood signals.
2. Add async ingestion/consolidation workflows for large or multi-step memory updates.
3. Add evaluation harnesses and quality gates for memory/retrieval regressions.
4. Add observability metrics that reflect real UX/AX outcomes.

## Non-Goals

1. Training custom foundation models.
2. Building benchmark leaderboards as a product feature.
3. Replacing all synchronous write paths.

## User Stories

### US-004-001 Scenario: Agent queries with different wording than stored memory

Acceptance Criteria:

- Given a query that lacks exact keyword overlap with stored memory
- When hybrid retrieval is used
- Then relevant entries can still be returned via semantic and graph signals

- Given a query with both precise terms and related graph context
- When ranking is computed
- Then results include weighted evidence from lexical, embedding, and graph components

### US-004-002 Scenario: Client paginates through large result sets

Acceptance Criteria:

- Given a retrieval request with `limit`, `cursor`, and weighting controls
- When the query executes
- Then results are paginated deterministically with returned ranking scores
- And results are ordered by `score_total` descending with a deterministic tie-breaker by `entry_id` ascending
- And each result includes `score_total` and per-component score fields for explainability
- And `cursor` is an opaque token returned by the prior page and is the only supported pagination mechanism

- Given a retrieval request includes an `offset`
- When the server validates the request
- Then it returns a validation error indicating `offset` is not supported and `cursor` must be used instead

- Given constraints for latency-sensitive use
- When reduced-depth options are selected
- Then retrieval completes within configured bounds with documented tradeoffs

### US-004-003 Scenario: User imports a large document for memory extraction

Acceptance Criteria:

- Given an ingestion request exceeds synchronous limits
- When submitted to async processing
- Then the server returns a task handle and progress can be queried

- Given consolidation completes
- When results are finalized
- Then created or updated entries/triples are auditable in history

### US-004-004 Scenario: CI detects retrieval quality regression

Acceptance Criteria:

- Given a code or schema change affecting retrieval or memory behavior
- When CI evaluation runs
- Then benchmark metrics are compared to a committed baseline at `evals/baselines/retrieval.json`
- And evaluation results are written as an artifact at `evals/artifacts/retrieval.json`
- And CI fails the gate when any of the following regressions occur versus baseline:
  - `ndcg_at_10` decreases by more than 2% (relative)
  - `mrr_at_10` decreases by more than 2% (relative)
  - `recall_at_20` decreases by more than 1% (relative)
  - `latency_p95_ms` increases by more than 10% (relative)
- And CI runs this evaluation when changes touch `src/**`, `evals/**`, or `migrations/**`

- Given evaluation results are produced
- When operators inspect them
- Then they can see a metric breakdown by retrieval type and scenario class
- And the report includes the git revision, baseline revision, and pass/fail decision per metric

### US-004-005 Scenario: Operator investigates retrieval latency spike

Acceptance Criteria:

- Given production traffic
- When observability is enabled
- Then metrics capture retrieval latency, hit quality proxies, mutation success, and conflict incidence

- Given metric thresholds are exceeded
- When alerts trigger
- Then operators receive clear remediation guidance tied to affected subsystems

## Example Payloads

### Hybrid retrieval result (US-004-001)

A hybrid `query` returns per-entry score breakdowns and pagination metadata. Each result shows the contribution of lexical, semantic, and graph signals to the total score.

```jsonc
// Tool result content array for: query({ topic: "deployment strategy", limit: 2 })
[
  {
    "type": "text",
    "text": "Found 12 entries; showing top 2 by hybrid score."
  },
  {
    "type": "resource",
    "resource": {
      "uri": "knowledge://entries?topic=deployment+strategy&limit=2",
      "mimeType": "application/json",
      "text": "{\"items\":[{\"id\":\"e-42\",\"topic\":\"deployment\",\"content\":\"Use blue-green deploys for zero-downtime releases.\",\"score_total\":0.91,\"score_lexical\":0.45,\"score_semantic\":0.82,\"score_graph\":0.38,\"graph_hops\":1},{\"id\":\"e-103\",\"topic\":\"release rollback\",\"content\":\"Rollback within 5 min if error rate exceeds 1%.\",\"score_total\":0.84,\"score_lexical\":0.12,\"score_semantic\":0.79,\"score_graph\":0.55,\"graph_hops\":2}],\"next_cursor\":\"eyJvZmYiOjJ9\",\"retrieval_ms\":47}"
    }
  }
]
```

## Edge Cases and Constraints

1. Embedding generation and storage must respect data privacy constraints.
2. Async ingestion must be idempotent under retries.
3. Hybrid retrieval fallback must work when embedding backends are unavailable.
4. Evaluation datasets should include adversarial and long-horizon cases, not only happy paths.
5. Requires Cloudflare Vectorize for embedding index.

### Scale Expectations

- Up to 50K entries with embeddings, 100 RPS/tenant.
- Hybrid retrieval p95 < 300ms.
- Async ingestion: 10K entries/batch within 5 minutes.

## Alternatives Considered

1. **Pure embedding search.** Rejected: exact keyword matches lose precision when relying solely on vector similarity. Lexical signals are critical for technical terms and identifiers.
2. **External search service (Algolia).** Rejected: adds latency hop, recurring cost, and complicates the self-serve single-command deploy story.
3. **FTS5 only.** Rejected: semantic gap on paraphrased queries. Users searching "how to roll back a release" would miss entries stored as "deployment revert procedure."

## Prior Art

- **Mem0** — threshold-based semantic retrieval, LLM conflict resolution. lore-mcp borrows confidence-scored facts but prefers structured candidate resolutions over automatic LLM arbitration.
- **Zep/Graphiti** — bi-temporal graph, hybrid retrieval composition. lore-mcp adopts the hybrid pattern and score transparency; diverges with simpler weighted combination and D1 instead of Neo4j.
- **LangMem** — cognitive memory types, patch updates. lore-mcp takes structured mutation operations; diverges by not enforcing type taxonomy at schema level.
- **MS Kernel Memory** — pipeline ingestion handlers. lore-mcp adopts async pipeline concept; diverges by targeting CF Workers and integrating with graph governance.

## Success Metrics

1. Retrieval quality metrics improve against baseline on representative eval sets.
2. Median and tail retrieval latency remain within target budgets.
3. Regression rate in memory-dependent agent tasks decreases release-over-release.
