# Concerns Catalog

> **Layer:** 1 — Strategic Document
> **Nature:** Living document. Co-evolves with the Vision.
> **Owner:** Architect (facilitates), Stakeholders (contribute)
> **Lifecycle:** Draft → Reviewed → Baselined → Amended (continuously). Updated at every major milestone. Concerns are never deleted — only marked deferred or out-of-scope with rationale. New concerns surface during development.
> **Sibling relationship:** Bidirectional with Vision. Vision reframes which concerns are architecturally significant. Concerns surface needs that shape the Vision. Independent from Project Charter.

## Purpose

Capture what stakeholders care about, in their language, as questions the architecture must answer. This is the bridge between people (Layer 0) and requirements (Layer 2).

---

## Elicitation Method

- [x] Extracted from Problem Statement
- [x] Derived from Vision
- [x] Surfaced during development
- [x] Stakeholder interviews

---

## Concerns

### CC-001

- **Concern:** "How does my data stay mine if it's on a cloud provider?"
- **Quality Attribute:** Security
- **Stakeholder(s):** SH-001, SH-003
- **Priority:** Critical
- **Source:** Problem statement symptom 2
- **Status:** Addressed
- **Addressed by:** Single-owner deployment to user's own cloud account
- **Notes:** —

### CC-002

- **Concern:** "How do I move knowledge between Claude and ChatGPT?"
- **Quality Attribute:** Interoperability
- **Stakeholder(s):** SH-001, SH-002
- **Priority:** Critical
- **Source:** Problem statement symptom 1
- **Status:** Addressed
- **Addressed by:** MCP endpoint accessible to any compliant client
- **Notes:** —

### CC-003

- **Concern:** "Can I use this from my phone?"
- **Quality Attribute:** Usability
- **Stakeholder(s):** SH-001, SH-003
- **Priority:** High
- **Source:** Problem statement symptom 3
- **Status:** Addressed
- **Addressed by:** Remote MCP server (Streamable HTTP/SSE), EC-008
- **Notes:** —

### CC-004

- **Concern:** "Can a non-technical person deploy this?"
- **Quality Attribute:** Deployability
- **Stakeholder(s):** SH-003
- **Priority:** Critical
- **Source:** Problem statement symptom 4
- **Status:** Raised
- **Addressed by:** TBD
- **Notes:** Current deploy requires wrangler CLI + Cloudflare account setup. Not yet single-click.

### CC-005

- **Concern:** "What happens if the search returns irrelevant results?"
- **Quality Attribute:** Performance
- **Stakeholder(s):** SH-002
- **Priority:** High
- **Source:** Vision risk
- **Status:** Addressed
- **Addressed by:** Hybrid retrieval with configurable weights, eval pipeline
- **Notes:** —

### CC-006

- **Concern:** "What if I store something wrong — can I undo it?"
- **Quality Attribute:** Reliability
- **Stakeholder(s):** SH-001, SH-002
- **Priority:** High
- **Source:** Vision-derived
- **Status:** Addressed
- **Addressed by:** Transaction log with undo/revert
- **Notes:** —

### CC-007

- **Concern:** "How do I know where a fact came from?"
- **Quality Attribute:** Reliability
- **Stakeholder(s):** SH-002
- **Priority:** Medium
- **Source:** Vision-derived
- **Status:** Addressed
- **Addressed by:** Provenance fields (source, actor, confidence) on entries and triples
- **Notes:** —

### CC-008

- **Concern:** "What happens if Cloudflare changes or deprecates D1/Vectorize?"
- **Quality Attribute:** Modifiability
- **Stakeholder(s):** SH-001
- **Priority:** Medium
- **Source:** Vision risk, EC-001/EC-002
- **Status:** Acknowledged
- **Addressed by:** Effect isolation — DB layer swappable without touching domain logic
- **Notes:** —

### CC-009

- **Concern:** "Is the MCP endpoint secure against tool poisoning and prompt injection?"
- **Quality Attribute:** Security
- **Stakeholder(s):** SH-001, SH-003
- **Priority:** High
- **Source:** Problem statement symptom 8
- **Status:** Addressed
- **Addressed by:** OAuth 2.1, CSRF tokens, rate limiting, timing-safe comparisons
- **Notes:** —

### CC-010

- **Concern:** "Can agents tell me when something isn't working well?"
- **Quality Attribute:** Usability
- **Stakeholder(s):** SH-002
- **Priority:** Medium
- **Source:** Stakeholder register note on SH-002
- **Status:** Raised
- **Addressed by:** TBD
- **Notes:** Feedback tool not yet implemented.

### CC-011

- **Concern:** "How do I be sure the agent can not delete something forever?"
- **Quality Attribute:** Reliability / Security
- **Stakeholder(s):** SH-001, SH-003
- **Priority:** Critical
- **Source:** Stakeholder-raised
- **Status:** Verified — gaps found
- **Addressed by:** Soft-delete for entries/triples (reversible via undo). Two gaps remain.
- **Notes:** Entries and triples use soft-delete (deleted_at timestamp) and are fully reversible via undo tool. However, two MCP tool paths cause irreversible hard DELETEs: (1) `merge_entities` hard-deletes the merged canonical_entities row (runtime.efct.ts:819) and buildUndoStatements has no MERGE revert logic; (2) `resolve_conflict` with strategy="reject" hard-deletes the conflicts row (conflicts.efct.ts:32) without transaction logging. Both need remediation — either convert to soft-delete or add undo support.

---

## Quality Attribute Coverage

- **Testability** — No concern raised yet. Gap.
- **Modifiability** — CC-008. Adequate.
- **Performance** — CC-005. Adequate.
- **Reliability** — CC-006, CC-007, CC-011. Adequate.
- **Security** — CC-001, CC-009, CC-011. Adequate.
- **Usability** — CC-003, CC-010. Adequate.
- **Deployability** — CC-004. Gap — not yet addressed.
- **Interoperability** — CC-002. Adequate.

---

## Traceability

This document feeds into:
- FR (functional requirements derive from concerns)
- NFR (quality requirements formalize concerns as measurable scenarios)
- ADR (architecture decisions respond to concerns)

This document is fed by:
- Stakeholder Register (stakeholders hold concerns)
- Problem Statement (symptoms surface concerns)
- External Constraints (constraints surface concerns)
- Vision (bidirectional — vision reframes which concerns matter)

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft |
