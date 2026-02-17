# Specs

## Dependency Graph

```mermaid
graph LR
  001[001 Self-Serve Updates]
  002[002 MCP UX Contracts]
  003[003 Graph Semantics]
  004[004 Hybrid Retrieval]

  002 --> 003
  002 --> 004
  003 --> 004
```

## Index

| Spec | Name | State | Depends On |
|------|------|-------|------------|
| [001](001-self-serve-updates/spec.md) | Self-Serve Updates | implementation_complete | — |
| [002](002-mcp-ux-contracts/spec.md) | MCP UX Contracts | planned | — |
| [003](003-graph-semantics-and-governance/spec.md) | Graph Semantics & Governance | planned | 002 |
| [004](004-hybrid-retrieval-and-evals/spec.md) | Hybrid Retrieval & Evals | planned | 002, 003 |
