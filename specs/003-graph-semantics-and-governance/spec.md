# Spec 003: Graph Semantics, Provenance, and Governance

## Problem Statement

The current graph supports create/query/delete operations, but lacks canonical entity semantics, provenance metadata, and governance rules needed for high-trust multi-step agent workflows.

## Goals

1. Add canonical entity identity and alias/merge flows.
2. Add provenance and confidence metadata to entries and triples.
3. Add explicit triple update/upsert operations with conflict handling.
4. Add validation and policy checks to reduce low-quality graph mutations.

## Non-Goals

1. Full ontology authoring UI.
2. Cross-organization tenancy and role hierarchies.
3. Automatic truth arbitration without human review signals.

## User Stories

### US-003-001 Scenario: Agent encounters duplicate entity names

Acceptance Criteria:

- Given an entity already exists under a canonical identifier
- When a new alias is introduced
- Then the alias resolves to the canonical identifier for retrieval and mutation operations

- Given two entities are confirmed duplicates
- When a merge operation is executed
- Then the response includes `kept_entity_id` and `merged_entity_id`
- And `merged_entity_id` resolves as an alias to `kept_entity_id` for subsequent retrieval and mutation operations
- And triples referencing `merged_entity_id` resolve to `kept_entity_id` as of the next committed snapshot

### US-003-002 Scenario: User audits where a fact came from

Acceptance Criteria:

- Given an entry or triple is created or updated
- When the write is committed
- Then provenance metadata includes `source`, `actor`, `recorded_at` (ISO 8601 timestamp), and `confidence`
- And it may include lifecycle fields such as `valid_from`, `valid_to`, and `status` without replacing `recorded_at`

- Given a client queries entries or graph triples
- When results are returned
- Then provenance and confidence metadata are included in structured output

### US-003-003 Scenario: Agent corrects an outdated relationship

Acceptance Criteria:

- Given a triple identifier exists
- When an update operation changes predicate, object, or metadata
- Then the triple is updated and a transaction is recorded with before/after snapshots

- Given an equivalent triple does not exist
- When an upsert is requested
- Then a new triple is created and returned with creation metadata

### US-003-004 Scenario: New fact contradicts an existing triple

Acceptance Criteria:

- Given a write introduces a contradicting fact under the same canonical subject and predicate scope
- When conflict rules detect inconsistency
- Then the server returns a conflict response with candidate resolutions

- Given client policy prefers non-destructive resolution
- When conflict occurs
- Then both facts can be retained with status/validity markers and confidence adjustments

### US-003-005 Scenario: Low-confidence write blocked by policy

Acceptance Criteria:

- Given a mutation request violates policy thresholds or required metadata fields
- When the server evaluates the request
- Then the write is rejected with a structured policy error

- Given a mutation passes policy checks
- When it is applied
- Then the audit trail includes the policy decision context

## Example Payloads

### Conflict detection response for `relate` (US-003-004)

When a `relate` call detects a contradiction with an existing triple, the server returns a conflict response with candidate resolutions. The client or agent chooses a strategy to proceed.

```jsonc
// Tool result content array for: relate({ subject: "Alice", predicate: "works_at", object: "Acme Corp", confidence: 0.88 })
[
  {
    "type": "text",
    "text": "Conflict detected: \"Alice works_at\" has an existing value. Review candidate resolutions."
  },
  {
    "type": "resource",
    "resource": {
      "uri": "knowledge://graph/conflicts/c-1701",
      "mimeType": "application/json",
      "text": "{\"conflict_id\":\"c-1701\",\"scope\":{\"subject\":\"Alice\",\"predicate\":\"works_at\"},\"existing\":{\"triple_id\":\"t-302\",\"object\":\"Globex Inc\",\"confidence\":0.75,\"recorded_at\":\"2026-01-15T10:00:00Z\"},\"incoming\":{\"object\":\"Acme Corp\",\"confidence\":0.88,\"recorded_at\":\"2026-02-14T12:00:00Z\"},\"candidate_resolutions\":[{\"strategy\":\"replace\",\"description\":\"Replace existing triple with incoming (higher confidence).\"},{\"strategy\":\"retain_both\",\"description\":\"Keep both with validity markers; mark existing valid_to=now.\"},{\"strategy\":\"reject\",\"description\":\"Reject incoming write; keep existing triple unchanged.\"}]}"
    }
  }
]
```

## Edge Cases and Constraints

1. Merge operations must remain reversible through transaction history where feasible.
2. Provenance fields must not expose secrets from raw source documents.
3. Confidence is advisory and must not be interpreted as objective truth.
4. Conflict detection should be configurable to avoid over-blocking benign updates.

### Scale Expectations

- Up to 50K entries, 200K triples, 100K aliases.
- Mutation p95 < 200ms including conflict detection.
- Alias resolution p95 < 50ms.

## Alternatives Considered

1. **External graph DB (Neo4j).** Rejected: adds infrastructure dependency and operational burden. D1/SQLite is sufficient at the target scale (50K entries, 200K triples) and keeps the self-serve deploy simple.
2. **Exact-match dedup only.** Rejected: real-world entity names vary in casing, abbreviation, and spelling. Alias resolution with fuzzy matching is necessary for practical dedup.

## Success Metrics

1. Duplicate entity rate decreases across representative datasets.
2. Percentage of graph facts with complete provenance metadata reaches target threshold.
3. Conflicting-fact incidents are surfaced explicitly instead of silently overwriting prior data.
