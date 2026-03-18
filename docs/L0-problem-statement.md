# Problem Statement

> **Layer:** 0 — Pre-existing Input
> **Nature:** Document written by stakeholders. Describes observed reality.
> **Owner:** Stakeholders (authored), Architect (may facilitate)
> **Lifecycle:** Created before the project begins. Baselined at project start. Amended only if the problem itself changes (rare — if the problem changes, it's often a new project).

## Purpose

Describe what is broken, missing, or suboptimal in the current state. This document captures observed reality, not desired outcomes. It answers: "What pain exists today?"

---

## 1. Current State

### 1.1 Context

A person uses multiple AI agents — ChatGPT, Claude, Codex, Claude Code — across desktop and mobile. Each agent has its own siloed knowledge store controlled by the provider corporation.

### 1.2 Observed Symptoms

1. No way to share data between agents except copy-paste. Knowledge stored in Claude is invisible to ChatGPT and vice versa.
2. The data is owned by the corporations running the agents, not by the person who created it.
3. Existing "memory bank" solutions are local-only. No way to connect Claude and ChatGPT mobile apps to them.
4. Existing self-deployed cloud-based solutions require technical knowledge and are complex to set up. No true single-click deploy.
5. Provider data loss is real and recurring. ChatGPT had a mass memory wipe in Feb 2025. Gemini had conversation history disappearance in Feb 2026.
6. Provider memory is a black box. Users can't see what memories influence responses, can't debug bad output, can't selectively edit or version.
7. Context rot. Accumulated stale memories in provider systems degrade response quality over time. Old preferences conflict with current ones and the model can't reconcile.
8. MCP security in the wild is poor. Documented tool poisoning attacks, rug pulls, prompt injection through tool descriptions, supply chain vulnerabilities.

### 1.3 Evidence

- ChatGPT Feb 2025 memory wipe confirmed via OpenAI status page and community posts.
- Gemini Feb 2026 incident confirmed via Google Workspace status dashboard.
- Official MCP memory server stores data in JSONL without file locking — concurrent writes corrupt data (GitHub issues #1819, #2577).
- CVE-2025-6514 (mcp-remote) affected 437,000+ downloads.
- Smithery registry path traversal exposed 3,000+ MCP servers.

## 2. Impact

### 2.1 Who is affected

- SH-001 (user/owner) — knowledge fragments across providers
- SH-002 (AI agents) — operate without cross-agent context

### 2.2 Cost of inaction

The user's own insights, decisions, and context are locked inside corporate silos they don't control, can't interconnect, and can't trust to persist.

## 3. Root Causes (if known)

1. AI providers treat user knowledge as platform-internal state, not user-owned portable data.
2. No cross-agent protocol existed until MCP — and adoption is still provider-by-provider.
3. Local-only MCP servers can't serve mobile or multi-device use cases.
4. Self-hosted solutions optimize for developer capability, not deployment simplicity.

## 4. Boundaries

NOT about: replacing provider-side memory features, building a general-purpose sync service, multi-user collaboration, model training.

## 5. Prior Attempts (if any)

- **Provider built-in memory** (ChatGPT memory, Claude memory) — corporate-owned, siloed, no cross-agent access, subject to data loss, black box.
- **Local MCP memory servers** — work for desktop CLI agents, unreachable from mobile apps, JSONL-based, fragile under concurrent use.
- **Copy-paste** — works but doesn't scale, no structure, no retrieval.

---

## Traceability

This document is referenced by:
- Concerns Catalog (concerns arise from the problem)
- Vision (responds to the problem)
- Project Charter (scopes which parts of the problem to address)

## Revision History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 0.1 | 2026-03-03 | Andrii Rudavko + Claude (Opus 4.6) | Initial draft |
