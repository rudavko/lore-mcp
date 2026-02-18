# Spec 005: Architectural Hardening

## Problem Statement

A cross-cutting audit of the codebase after live alpha testing identified six architectural problems that, if left unaddressed, will produce data loss, silent correctness failures, and performance cliffs as the knowledge base grows. The bugs are symptoms of four root causes:

1. **Split retrieval architecture** — two parallel list-returning code paths (`hybridSearch` vs `queryEntries`/`queryTriples`/`getHistory`) with incompatible pagination contracts, causing tag-only queries to be unbounded full-table scans and `query_graph` / `history` to have no pagination.
2. **Vectorize/D1 write asymmetry** — embeddings are synced on create/update but never deleted, causing soft-deleted entries to resurface in semantic search results.
3. **Conflict state outside the durable store** — conflict IDs returned by `relate` are stored in Durable Object memory, not D1, so they are lost on any routing change or reconnect, making `resolve_conflict` silently non-functional in production.
4. **Validation split at the create/update boundary** — length and field constraints are checked in `createEntry`/`createTriple` but not in `updateEntry`/`updateTriple`, allowing updates to produce entries that could never have been created.

Two additional schema-level issues harden the system against future correctness regressions: missing `UNIQUE` constraints on `canonical_entities.name` and `entity_aliases.alias` allow application-level uniqueness logic to be bypassed by concurrent requests or future write paths.

## Goals

1. All list-returning tools (`query`, `query_graph`, `history`) return a consistent `{ items, next_cursor }` envelope with working cursor pagination.
2. Soft-deleted entries never appear in semantic search results.
3. `resolve_conflict` works reliably regardless of DO routing between `relate` and `resolve_conflict` calls.
4. Length and field validation is applied on both create and update paths for entries and triples.
5. Database schema enforces uniqueness invariants that the application currently only protects in code.
6. The `query` tool correctly handles `topic` + `content` provided simultaneously.

## Non-Goals

1. Graph expansion redesign (entity-graph traversal via `canonical_entity_id`) — tracked separately.
2. Full-text search ranking improvements or embedding model changes.
3. Multi-tenant isolation or access control changes.
4. Changes to auth, TOTP, passkey, or Cloudflare Access flows.

## User Stories

### US-005-001: Agent paginates through all triples

Acceptance Criteria:

- Given a knowledge base with more entries than the default limit
- When an agent calls `query_graph` with no cursor
- Then the response contains `next_cursor` when more results exist
- And calling `query_graph` again with that cursor returns the next page with no overlapping items

- Given an agent calls `query_graph` and receives a page where `next_cursor` is null
- Then no further pages exist

### US-005-002: Agent paginates through transaction history

Acceptance Criteria:

- Given a knowledge base with more than 20 transactions
- When an agent calls `history` with no cursor
- Then the response contains `next_cursor` when more results exist
- And calling `history` again with that cursor returns non-overlapping results

### US-005-003: Agent paginates tag-only queries without full table scan

Acceptance Criteria:

- Given a knowledge base with 10,000 entries where 50 are tagged `"important"`
- When an agent calls `query` with `tags: ["important"]` and no topic or content
- Then the response returns at most `limit` items and a correct `next_cursor`
- And the query does not fetch all 10,000 rows before filtering

### US-005-004: Deleted entries do not appear in search

Acceptance Criteria:

- Given an entry exists and has been soft-deleted
- When an agent calls `query` with a topic or content string that matches the deleted entry
- Then the deleted entry does not appear in results, regardless of whether semantic or lexical search is used

### US-005-005: Conflict resolution survives routing changes

Acceptance Criteria:

- Given an agent calls `relate` and receives a conflict response containing `conflict_id`
- When the agent calls `resolve_conflict` with that `conflict_id` in a subsequent MCP session (simulating reconnect or DO re-routing)
- Then the resolution succeeds rather than returning `not_found`

- Given a conflict is older than 1 hour
- When an agent calls `resolve_conflict` with that `conflict_id`
- Then the response is `not_found` (TTL enforced)

### US-005-006: Update enforces the same field constraints as create

Acceptance Criteria:

- Given an entry exists with a short topic and content
- When an agent calls `update` with a topic exceeding 1,000 characters
- Then the call is rejected with a `validation` error

- Given a triple exists
- When an agent calls `update_triple` with an object exceeding 2,000 characters
- Then the call is rejected with a `validation` error

### US-005-007: Concurrent entity creation does not produce duplicates

Acceptance Criteria:

- Given a canonical entity named `"TypeScript"` already exists
- When a second `upsert_entity` call for `"TypeScript"` races with the first at the DB level
- Then only one canonical entity with that name exists after both calls complete

### US-005-008: Query with both topic and content uses both

Acceptance Criteria:

- Given an agent calls `query` with `topic: "VO2max"` and `content: "training"`
- When the server processes the request
- Then both terms are used in the search query rather than content being silently dropped
