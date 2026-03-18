# MCP Tools and Resources

## Tools

| Tool | Description |
|---|---|
| `store` | Create a knowledge entry with optional provenance |
| `update` | Update an existing entry |
| `query` | Hybrid search: FTS5 lexical + Vectorize semantic + graph expansion (combines `topic` + `content` when both are provided) |
| `delete` | Soft-delete an entry or triple |
| `relate` | Create a graph triple with conflict detection |
| `query_graph` | Query triples by subject / predicate / object with cursor pagination |
| `update_triple` | Update an existing triple |
| `upsert_triple` | Create-or-update a triple by subject+predicate |
| `resolve_conflict` | Resolve a detected triple conflict (replace / retain_both / reject) |
| `upsert_entity` | Create or resolve a canonical entity by name |
| `set_type` | Set `knowledge_type` and/or `memory_type` for an entry |
| `merge_entities` | Merge two canonical entities |
| `extract_lessons` | Create `lesson` entries from refuted hypotheses and link via `derived_from` |
| `undo` | Revert recent transactions |
| `history` | View transaction history with cursor pagination |
| `ingest` | Bulk-ingest text (sync for small inputs, async for large) |
| `ingestion_status` | Check async ingestion progress |
| `time` | Current time in any IANA timezone |
| `build_info` | Current `package.json` version and deployed build hash |
| `enable_auto_updates` | Generate a one-time browser link that installs `upstream-sync.yml` into the baked deploy repository |

## Resources (Paginated, Cursor-Based)

- `knowledge://entries` - all entries
- `knowledge://graph/triples` - all triples
- `knowledge://history/transactions` - transaction log

## Prompts

- `ingest-memory` - guide for storing knowledge with provenance
- `retrieve-context` - guide for querying with filters and scoring
- `correct-stale-facts` - guide for finding and updating outdated facts

## Two-Axis Model

See [knowledge-model.md](./knowledge-model.md) for:

- The 9 `knowledge_type` values with examples
- The 3 `memory_type` values and promotion rules
- Fixed promotion predicates: `supported_by`, `grounded_by`, `derived_from`
