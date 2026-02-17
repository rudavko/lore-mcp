# Tasks 004: Hybrid Retrieval, Async Ingestion, and Quality Evals

## Ordered Checklist

1. [ ] Design hybrid retrieval interface and scoring contract.
2. [ ] Add embedding generation/storage integration and fallback behavior.
3. [ ] Implement graph neighborhood expansion and scoring features.
4. [ ] Implement combined ranking output with explainable score components.
5. [ ] Add query pagination and retrieval tuning parameters.
6. [ ] Implement async ingestion task submission and status retrieval.
7. [ ] Implement consolidation pipeline with dedupe/canonicalization hooks.
8. [ ] Add history linkage from ingestion outputs to resulting mutations.
9. [ ] Build benchmark/eval suite for retrieval and long-horizon memory scenarios.
10. [ ] Add CI regression gates with baseline comparisons and thresholds.
11. [ ] Add runtime metrics, dashboards, and alerting rules for AX-relevant KPIs.
12. [ ] Update docs with retrieval tuning guidance and operational runbooks.
13. [ ] Validate acceptance criteria and update `status.yaml`.

## Verification Checklist

1. [ ] Hybrid retrieval outperforms baseline substring retrieval on target eval metrics.
2. [ ] Retrieval pagination is deterministic and stable across repeated calls.
3. [ ] Async ingestion tasks are resumable or idempotent under retry conditions.
4. [ ] CI blocks merges when configured regression thresholds are exceeded.
5. [ ] Observability dashboards show actionable latency and quality signals.

