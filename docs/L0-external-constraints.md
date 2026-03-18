# External Constraints

> **Layer:** 0 — Pre-existing Input
> **Nature:** Document. Records non-negotiable external facts that exist independently of this project.
> **Owner:** Architect (documents), Stakeholders (validate)
> **Lifecycle:** Created at project inception. Updated when external facts change (e.g., new regulation, platform update). Constraints are never "resolved" — they are facts. They may become obsolete if the external condition changes.

## Purpose

Record every external fact that bounds the solution space. These constraints exist before the project and cannot be changed by the project. They are inputs, not decisions.

---

## Constraint Registry

| ID | Constraint | Category | Source | Verifiable? | Impact |
|----|-----------|----------|--------|-------------|--------|
| EC-001 | Cloudflare Workers runtime. V8 isolates, not Node.js. CPU time limits, memory limits, no filesystem. | Platform | Cloudflare Workers docs | Yes — deploy fails if violated | Bounds all runtime behavior |
| EC-002 | D1 (SQLite). SQLite query subset, row size limits, no server-side joins across databases. | Dependency | Cloudflare D1 docs | Yes — queries fail at limits | Bounds storage and query patterns |
| EC-003 | Durable Objects with SQLite storage. Stateful compute with embedded SQLite. Single-writer model. | Platform | Cloudflare DO docs | Yes — runtime enforced | Bounds concurrency and state management |
| EC-004 | Vectorize. 768 dimensions, cosine metric, bge-base-en-v1.5 embeddings via Workers AI. Optional binding — system must degrade gracefully without it. | Dependency | Cloudflare Vectorize docs | Yes — binding presence check | Bounds semantic search capability |
| EC-005 | MCP specification. Protocol defines tool schemas, auth flow, transport (Streamable HTTP / SSE). Must conform to remain compatible with clients. | Technical | MCP spec | Yes — client interop tests | Bounds protocol interface |
| EC-006 | OAuth 2.1. Auth protocol required by MCP for remote servers. | Technical | MCP auth spec | Yes — auth flow tests | Bounds auth implementation |
| EC-007 | Single-owner deployment model. One passphrase, one TOTP secret, one user per deployment. | Organizational | Architectural decision | Yes — auth config enforces | Bounds auth and data model |
| EC-008 | Mobile MCP access requires remote server. Mobile apps (Claude iOS, ChatGPT) can only connect via Streamable HTTP / SSE. No stdio. | Technical | Client implementations | Yes — mobile connection test | Bounds deployment topology |

---

## Assumptions

| ID | Assumption | Risk if wrong | Verification plan | Status |
|----|-----------|---------------|-------------------|--------|
| EA-001 | Cloudflare free/paid tier limits are sufficient for single-owner usage | Need to migrate or pay more | Monitor D1 row counts, KV usage, Worker invocations | Unverified |
| EA-002 | MCP spec will remain backward-compatible | Breaking changes require tool schema rewrites | Track MCP spec repo for breaking changes | Unverified |

---

## Traceability

This document is referenced by:
- Concerns Catalog (constraints surface concerns)
- Vision (constraints bound what's achievable)
- Project Charter (constraints define the boundary)
- FR / NFR (constraints impose functional and quality requirements)
- Constraints (Layer 2) (external constraints flow directly; charter adds derived constraints)

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft |
