# Task UNR-017: Direct Entity Fields vs Relational Links

## Suggestion

Keep scalar/filterable facts such as `entity_type`, `source`, `confidence`, `validity`, `specificity`, and `tags` as direct entity fields, but represent relational facts such as `about`, `affects`, and `produced_by` as `link_object` relations.

## Rationale

- FR-003
- FR-009
- NFR-002
- NFR-003

## ICE

- Impact: 9, I assume.
- Confidence: 7, I assume.
- Ease: 4, I assume.
- ICE: 252, I assume.
