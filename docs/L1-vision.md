# Vision

> **Layer:** 1 — Strategic Document
> **Nature:** Aspirational document. Describes the target state.
> **Owner:** Architect (primary author), Stakeholders (validate)
> **Lifecycle:** Draft → Agreed → Stable → Retired/Superseded. The most stable Layer 1 document. Should change rarely. When the vision changes fundamentally, it's effectively a new project. Revisit at major phase gates or when foundational assumptions shift.
> **Sibling relationship:** Bidirectional with Concerns Catalog. Vision responds to concerns; Vision reframes which concerns are architecturally significant. Independent from Project Charter.

## Purpose

Describe what the world looks like when we succeed. The Vision answers: "What are we building toward?" It is not a plan — it is a destination.

---

## 1. Vision Statement

> AI agents persist and retrieve structured knowledge across sessions through a single MCP endpoint.

---

## 2. Problem Response

Agents lose context between sessions. This gives them a persistent store they read/write mid-session.

---

## 3. Architectural Conviction

"AI-native, not human-adapted." Built for programmatic consumers (MCP tool calls), not human readers. Effect isolation for testability. Hybrid retrieval (lexical + semantic + graph) over single-signal search.

Origin:
- [x] **Both** — pain point (agents can't retain knowledge) triggered conviction (build for how agents consume, not how humans browse)

---

## 4. Success Image

- Agent in session N retrieves a fact stored in session 1 without re-explanation
- Retrieval returns relevant results even when query wording differs from stored text
- Related facts surface through graph adjacency
- Every fact carries provenance (who, when, confidence, source)
- Mistakes are reversible without data loss
- Deployable to an individually owned cloud account

---

## 5. Change Drivers

- MCP exists — standardized way for agents to call tools on external services mid-session
- AI coding agents are daily-use tools — context loss compounds with usage frequency

---

## 6. Anti-Goals

- Multi-user / multi-tenant
- Human-readable UI beyond auth pages
- Real-time sync between agents
- General-purpose database or wiki
- Replacing IDE features

---

## 7. Risks to the Vision

- MCP spec breaks backward compatibility — pin to known-good version, track spec repo
- Hybrid retrieval quality is poor in practice — eval pipeline with retrieval metrics, configurable weights
- Platform vendor changes break storage/search layer — effect isolation makes DB layer swappable

---

## Traceability

This document feeds into:
- FR (vision generates functional requirements stakeholders wouldn't have asked for)
- NFR (vision generates quality requirements)
- ADR (vision is the primary rationale source for structural decisions)

This document is fed by:
- Problem Statement (vision responds to the problem)
- Stakeholder Register (stakeholders validate the vision)
- External Constraints (constraints bound what's achievable)
- Concerns Catalog (bidirectional — concerns shape vision, vision reframes concerns)

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft |
