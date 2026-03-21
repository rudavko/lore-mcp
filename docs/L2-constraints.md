# Constraints

> **Layer:** 2 — Requirements and Architecture
> **Nature:** Derived constraints. Logical inevitabilities that follow from combining external constraints (L0) with functional requirements — zero degrees of freedom.
> **Owner:** Architect
> **Lifecycle:** Updated when external constraints change, new FRs are added, or architecture decisions reveal new inevitabilities.

## Purpose

Document constraints that emerge from the interaction of external constraints with requirements. These are not choices (those are ADRs) and not restatements of L0 (those stay in L0). Each entry here exists because the combination of two or more inputs forces a specific outcome with no alternative.

External constraints: L0-external-constraints.md. Project constraint DC-001 (solo developer): L1-project-charter.md section 6.

---

## Derived Constraints

### DC-002 — Object content size bounded by D1 row limits

- **Forced by:** EC-002 (D1 SQLite row size limits) + FR-001 (create object)
- **Why inevitable:** Entries are stored as D1 rows. D1 enforces physical row size limits. Storing content in a row forces a maximum content size. There is no alternative storage path within the platform constraints.
- **Consequence:** `MAX_CONTENT_LENGTH` validation gate in `src/db/entries.pure.ts`

### DC-003 — Bulk ingestion must process asynchronously for large payloads

- **Forced by:** EC-001 (Workers CPU time limits) + EC-002 (D1 row/transaction limits) + FR-008 (bulk ingestion pipeline)
- **Why inevitable:** Workers have ~30ms CPU budget per request. Parsing, chunking, embedding, and storing a large document exceeds this budget. Either process asynchronously or the request times out. Rejecting large ingests would violate FR-008.
- **Consequence:** Sync/async threshold in `src/domain/ingestion.pure.ts`; Durable Object scheduling for async path

### DC-004 — Search must function without Vectorize

- **Forced by:** EC-004 (Vectorize optional binding — "system must degrade gracefully without it") + FR-002 (retrieve knowledge)
- **Why inevitable:** If Vectorize is absent and search requires it, search breaks. EC-004 mandates graceful degradation. Therefore search must have a complete non-semantic retrieval path (lexical + graph only).
- **Consequence:** Weight redistribution in `src/db/search.pure.ts:redistributeWeights()`; semantic search skipped when `hasVectorize === false`

### DC-005 — Lexical search must fall back to LIKE when FTS5 unavailable

- **Forced by:** EC-002 (D1 exposes SQLite subset — FTS5 not guaranteed in all environments) + FR-002 (retrieve knowledge must work)
- **Why inevitable:** FTS5 virtual tables are an extension, not core SQLite. If D1 environment lacks FTS5, the only remaining text search primitive in SQLite is LIKE. Either fall back or search fails entirely.
- **Consequence:** FTS5 init wrapped in try-catch (`src/db/schema.efct.ts`); LIKE fallback in `src/db/search.efct.ts`

### DC-006 — All mutable state must persist to durable storage

- **Forced by:** EC-001 (Workers are stateless V8 isolates — memory lost after each request) + FR-006 (record mutation history)
- **Why inevitable:** Undo requires transaction snapshots that survive across requests. Workers isolates are ephemeral — in-memory state is gone after the response. All state must go to D1, KV, or Durable Object storage. There is no in-memory-across-requests option.
- **Consequence:** `transactions` table with `before_snapshot`/`after_snapshot` columns; every mutation writes to D1 before responding

### DC-007 — Embedding vectors fixed at 768 dimensions

- **Forced by:** EC-004 (bge-base-en-v1.5 model outputs 768-dim vectors; Vectorize index created with 768 dimensions)
- **Why inevitable:** The embedding model's output dimensionality is fixed. The Vectorize index dimension is set at creation time. Changing dimensions requires destroying and recreating the entire index (losing all existing embeddings). Until a model migration is performed, 768 is locked.
- **Consequence:** Hardcoded model name and dimension; ADR-0003 addresses the migration path

### DC-008 — Auth is binary (authenticated owner or rejected), no user table

- **Forced by:** EC-007 (single-owner deployment — one passphrase, one TOTP secret, one user) + EC-006 (OAuth 2.1 required)
- **Why inevitable:** One owner means no user table, no role matrix, no per-user isolation. Auth reduces to: is this the owner? Yes or no. Multi-user auth would require schema redesign (user_id foreign keys on every table) which contradicts EC-007.
- **Consequence:** No `users` table in schema; passphrase stored as single KV entry; all data belongs to the one owner

### DC-009 — Tool input/output schemas must conform to MCP specification

- **Forced by:** EC-005 (MCP specification defines tool schemas, transport, auth flow) + FR-001 through FR-005 (public MCP capability surface)
- **Why inevitable:** MCP clients parse tool schemas to discover capabilities. Non-conforming schemas are invisible or break clients. Conformance is binary — either the schema matches the spec or clients cannot call the tool.
- **Consequence:** Tool schemas in `src/mcp/tools.pure.ts` follow MCP schema conventions exactly

### DC-010 — Query result count must be hard-capped

- **Forced by:** EC-001 (Workers CPU/memory budget) + EC-002 (D1 query cost scales with result size) + FR-002 (retrieve knowledge)
- **Why inevitable:** Fetching, serializing, and returning unbounded result sets would exceed Workers CPU and memory budgets. Either cap the result count or queries timeout under load. Pagination mitigates but does not eliminate the need for a per-page ceiling.
- **Consequence:** `MAX_QUERY_LIMIT` in `src/config.pure.ts`; enforced in MCP tool schema

---

## Traceability

This document is fed by:
- L0-external-constraints.md (external constraints that combine to force derived constraints)
- L2-FR/ (functional requirements that interact with external constraints)

This document feeds into:
- ADR (derived constraints motivate architecture decisions — e.g., DC-007 drives ADR-0003)
- NFR (derived constraints impose quality bounds — e.g., DC-010 bounds response time)

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft — 9 derived constraints |
