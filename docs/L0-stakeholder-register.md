# Stakeholder Register

> **Layer:** 0 — Pre-existing Input
> **Nature:** People, not a document. This register records who they are.
> **Owner:** Project initiator
> **Lifecycle:** Created at project inception. Updated when new stakeholders are identified. Never closed — stakeholders exist independently of the project.

## Purpose

Identify every person or role whose concerns could influence architectural decisions or who will be affected by the system.

## Registry

| ID | Name / Role | Relationship to System | Influence | Interest | Primary Contact |
|----|-------------|----------------------|-----------|----------|----------------|
| SH-001 | Andrii Rudavko — Creator / owner | Builds, operates, uses | High | High | GitHub: rudavko |
| SH-002 | AI Agents (Claude, ChatGPT, Codex, etc.) | Uses the system as MCP clients — read/write knowledge, run queries, build context | Medium | High | MCP tool calls, feedback tool |
| SH-003 | Self-deploying users | Deploy LORE to their own cloud account, use daily | Low | High | GitHub issues |

## Notes

- SH-001 is simultaneously developer, operator, and end user.
- SH-002 can advocate for themselves via MCP — a feedback tool gives agents a direct channel to surface retrieval quality issues, missing capabilities, or tool call friction.
- SH-003 experience is bounded by symptom 4 from the problem statement — setup complexity is their primary barrier.

---

## Traceability

This register is referenced by:
- Problem Statement (stakeholders author it)
- Concerns Catalog (stakeholders hold concerns)
- Project Charter (stakeholders authorize scope)
- Every FR/NFR (traces to ≥1 stakeholder via concerns)
