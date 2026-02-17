# Tasks 003: Graph Semantics, Provenance, and Governance

## Ordered Checklist

1. [ ] Design and apply D1 schema migrations for provenance metadata and canonical entities.
2. [ ] Implement canonical entity/alias creation and lookup paths.
3. [ ] Implement `merge_entities` with transactional integrity and audit logging.
4. [ ] Add `update_triple` and `upsert_triple` operations with before/after snapshots.
5. [ ] Extend query responses to include provenance and confidence fields.
6. [ ] Implement conflict detection for contradictory facts under canonical scopes.
7. [ ] Implement policy guardrails for required metadata and confidence thresholds.
8. [ ] Update undo/history logic for merge/upsert/conflict paths.
9. [ ] Add tests for canonicalization, merges, provenance completeness, conflicts, and policy enforcement.
10. [ ] Update docs with graph governance model, examples, and operator controls.
11. [ ] Validate acceptance criteria and update `status.yaml`.

## Verification Checklist

1. [ ] Duplicate aliases resolve to canonical entities in retrieval and mutation flows.
2. [ ] New and updated facts contain required provenance metadata.
3. [ ] Triple update/upsert behavior is deterministic and auditable.
4. [ ] Conflict responses include machine-readable resolution options.
5. [ ] Policy violations are blocked and reported consistently.

