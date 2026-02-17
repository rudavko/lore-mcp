# ADR 0001: Adopt Spec-Bundle Workflow for Product Changes

- Status: Accepted
- Date: 2026-02-14

## Context

This repository is evolving toward agent-assisted development. We need product specs that are easy for both humans and agents to execute without ambiguity.

Two recurring issues prompted this decision:

1. Single-file story documents (for example, a monolithic `USERSTORIES.md`) become high-conflict and hard to review as scope grows.
2. Story-only docs without linked plan/tasks/status leave implementers making execution decisions ad hoc, which reduces consistency across contributors and agents.

## Decision

For behavior-changing product work, we will use a spec bundle per feature:

- Location pattern: `specs/NNN-feature-name/`
- Required files:
  - `spec.md`
  - `plan.md`
  - `tasks.md`
  - `status.yaml`

Specification requirements:

- `spec.md` contains user stories and acceptance criteria.
- Acceptance criteria use Gherkin-style Given/When/Then statements.
- `plan.md` captures technical approach.
- `tasks.md` is the ordered implementation checklist.
- `status.yaml` is machine-readable status for stories and phases.

## Alternatives Considered

1. Monolithic `USERSTORIES.md`
   - Pros: simple to start.
   - Cons: poor scalability, high merge conflict risk, weak execution traceability.

2. Per-story files only (for example `US01.md`, `US02.md`)
   - Pros: better than a monolith for diffs and ownership.
   - Cons: still lacks explicit execution artifacts unless additional files are manually introduced.

## Consequences

Positive:

- Better execution traceability from intent to implementation.
- Cleaner agent handoffs with lower decision ambiguity.
- Improved reviewability and lower merge contention.

Tradeoff:

- Slightly more documentation discipline is required for each feature.

## Compliance

Any pull request that changes product behavior must include updates to the relevant spec bundle in `specs/`.

