# Tasks 001: v0 Schema Migration Good Suggestions

## Notes

- Source: good-suggestion review output from this session, grounded.
- ICE scores are prioritization estimates for planning, I assume.

## Ordered Checklist

1. [x] **UNR-012** Replace prompt templates completely with a four-tool cookbook and concrete examples that match the real schemas. ICE: 648.
2. [x] **UNR-013** Rewrite README and reference docs to a single canonical four-tool surface with one short migration note. ICE: 648.
3. [x] **UNR-018** Make `engine_check.help` machine-readable with action names, schemas, examples, and deprecation notes. ICE: 567.
4. [x] **UNR-014** Write new contract tests first that assert exactly four tools and their result shapes, then delete the legacy surface tests. ICE: 504.
5. [ ] **UNR-001** Make `engine_check` a discriminated union on `action` with action-specific params and a shared `{ action, ok, data }` envelope; fold `help`, `status`, `history`, `ingest_status`, `build_info`, and `enable_auto_updates` under it. ICE: 504.
6. [ ] **UNR-015** Keep MCP resources as stable export-style resources separate from the four-tool action surface and document that separation explicitly. ICE: 448.
7. [ ] **UNR-003** Make `link_object` mirror the current triple contract with `subject`, `predicate`, `object`, provenance, validity, and cardinality controls so the existing graph/conflict machinery can be reused. ICE: 432.
8. [ ] **UNR-010** Extend entity validators, row mappers, write helpers, read helpers, and round-trip tests before wiring new MCP handlers. ICE: 384.
9. [ ] **UNR-016** Do a hard cutover in one branch or one tightly-scoped series of PRs, replacing tests and docs immediately. ICE: 384.
10. [ ] **UNR-007** Make `include_links` default false and, when true, hydrate only bounded 1-hop explicit links around returned objects. ICE: 336.
11. [ ] **UNR-011** Normalize `object_create.links` by translating each link into the same internal operation used by `link_object`, with one explicit transaction or partial-failure policy. ICE: 320.
12. [ ] **UNR-002** Make `object_create` a discriminated union on `kind`, with `note` requiring `payload.body` and `entity` requiring explicit entity metadata fields. ICE: 280.
13. [ ] **UNR-009** Add explicit nullable columns on `canonical_entities` for stable, queryable metadata and keep only flexible list-like fields in JSON text. ICE: 252.
14. [ ] **UNR-017** Keep scalar/filterable facts such as `entity_type`, `source`, `confidence`, `validity`, `specificity`, and `tags` as direct entity fields, but represent relational facts such as `about`, `affects`, and `produced_by` as `link_object` relations. ICE: 252.
15. [ ] **UNR-008** Expose `include_auto_links` as derived annotations with `implicit=true` and provenance of derivation, not as synthetic persisted triples. ICE: 245.
16. [ ] **UNR-004** Define `retrieve` around one query contract with `q`, filters, `limit`, `cursor`, `include_links`, and `include_auto_links`, with no caller-side `kind`. ICE: 216.
17. [ ] **UNR-005** Return heterogeneous `retrieve` items with a mandatory `kind` discriminator plus shared fields like `id`, `score`, `resource_uri`, and `payload`. ICE: 216.
18. [ ] **UNR-019** Make `retrieve` rank notes and entities as primary hits, then optionally hydrate explicit links around those hits instead of treating raw links as first-class primary search hits. ICE: 216.
19. [ ] **UNR-020** Expose auto-links only when the underlying canonical association is strong enough and always label them as implicit with derivation confidence. ICE: 192.
20. [ ] **UNR-006** Use one merged ranking pipeline with per-kind score normalization and stable ordering by score then id. ICE: 135.

## Verification Checklist

1. [ ] Each unresolved good suggestion from the session appears exactly once.
2. [ ] IDs `UNR-001` through `UNR-020` remain stable for future discussion.
3. [ ] Checklist order matches the ICE ranking used in the session.
