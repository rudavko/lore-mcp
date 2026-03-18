# Project Charter

> **Layer:** 1 — Strategic Document
> **Nature:** Authorization document. The contract between the team and stakeholders.
> **Owner:** Project sponsor (approves), Architect or project lead (drafts)
> **Lifecycle:** Draft → Signed/Approved → Active → Closed. The most procedural Layer 1 document. Changes require formal amendment with re-approval. Once signed, effectively frozen unless amended.
> **Sibling relationship:** None. Independent from Concerns Catalog and Vision. Reads from the same Layer 0 inputs independently.

## Purpose

Define what's in scope, what's out, what resources are committed, and what "done" looks like.

---

## 1. Project Identity

- **Project name:** LORE MCP
- **Sponsor:** Andrii Rudavko
- **Lead:** Andrii Rudavko
- **Date:** 2026-03-01
- **Status:** Active

---

## 2. Problem Summary

See L0-problem-statement.md.

---

## 3. Scope

### 3.1 In Scope

1. Deliver the system described in L1-vision.md as a deployable Cloudflare Worker
2. Documentation sufficient for SH-003 to deploy with CLI knowledge

### 3.2 Out of Scope

1. Everything listed as anti-goals in L1-vision.md
2. One-click deploy for non-technical users (CC-004 — raised, not committed)
3. Platforms other than Cloudflare Workers

---

## 4. Objectives

1. Any MCP-compliant client can store and retrieve knowledge through the same endpoint. Measure: two different clients read/write to the same instance.
2. Retrieval returns relevant results across lexical, semantic, and graph signals. Measure: eval pipeline scores above baseline.
3. Deploy to a user's own Cloudflare account with documented steps. Measure: setup script + docs enable deploy from zero.

---

## 5. Success Criteria

1. An agent stores a fact in session 1 and retrieves it in session N via a different client.
2. All MCP tools pass contract tests.
3. Auth flow prevents unauthorized access.

---

## 6. Constraints

- DC-001 — Solo developer. Source: this charter, risk 8.1.1. Category: Team.
- All external constraints per L0-external-constraints.md.
- Derived constraints (from combining ECs with FRs) documented in L2-constraints.md.

---

## 7. Stakeholders

Per L0-stakeholder-register.md. All stakeholders relevant.

---

## 8. Risks and Assumptions

### 8.1 Risks

1. Solo developer — bus factor of 1. Likelihood: inherent. Impact: High. Mitigation: docs and tests.
2. Cloudflare free tier limits hit. Likelihood: Low. Impact: Medium. Mitigation: monitor, paid tier fallback.

### 8.2 Assumptions

1. MCP adoption continues across major AI providers. Risk if wrong: endpoint becomes irrelevant.
2. Cloudflare Workers platform remains stable. Risk if wrong: migration required.

---

## 9. Milestones

TBD.

---

## 10. Authorization

- Sponsor: Andrii Rudavko
- Lead: Andrii Rudavko

---

## Traceability

This document feeds into:
- FR / NFR (charter filters which requirements are in scope)
- Constraints (Layer 2) (charter scope decisions produce derived constraints)

This document is fed by:
- Stakeholder Register (who is involved)
- Problem Statement (what we're solving)
- External Constraints (what we can't change)

## Amendment Log

_No amendments yet._

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft |
