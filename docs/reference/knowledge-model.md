# Two-Axis Knowledge Model

## Knowledge Types (Epistemic Axis)

| Type | Meaning | Example |
|---|---|---|
| `observation` | Raw captured statement or event | "Build took 12 minutes on CI." |
| `evidence` | Source-backed support material | "Benchmark run #42 from profiler export." |
| `assumption` | Working premise not yet validated | "Latency spike is network-bound." |
| `hypothesis` | Testable explanatory claim | "Cache churn causes p95 jump." |
| `fact` | Fully supported and certain claim | "Service hard limit is 100 RPS." |
| `decision` | Chosen action or policy | "Keep graph predicates single-valued by default." |
| `question` | Open unresolved inquiry | "Why do retries cluster at minute 15?" |
| `pattern` | Repeating, generalized behavior | "Deploy failures cluster after dependency upgrades." |
| `lesson` | Distilled transferable insight | "Probe fallback paths before enabling strict validation." |

## Memory Types (Retention Axis)

| Type | Meaning | Typical Use |
|---|---|---|
| `fleeting` | Short-lived working memory | Draft notes, temporary observations |
| `factual` | Durable operational knowledge | Verified findings, stable references |
| `core` | Long-lived foundational memory | Canon constraints, high-value doctrine |

## Promotion Rules

1. `evidence` requires non-empty `source`; writes without `source` are rejected.
2. `fact` requires `confidence = 1.0` and at least one active `supported_by` edge. If not satisfied, type is auto-demoted to `hypothesis`.
3. `status = refuted` is valid only for `knowledge_type = hypothesis`.
4. Refuted hypotheses are never TTL-pruned and remain queryable.
5. Refuted hypotheses can be converted into `lesson` entries via `extract_lessons`, with provenance linked by `derived_from`.

## Fixed Promotion Predicate Vocabulary

Only these predicates are treated as promotion predicates:

- `supported_by`
- `grounded_by`
- `derived_from`

Rules:

1. Endpoints must be existing entries (subject/object are entry IDs).
2. Endpoint knowledge-type pairs must be compatible with predicate semantics.
3. Knowledge-type changes are blocked when existing promotion edges would become incompatible.
