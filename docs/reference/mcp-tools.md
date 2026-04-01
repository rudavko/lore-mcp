# MCP Tools and Resources

## Migration Note

The public v0 MCP surface is exactly four tools:

- `link_object`
- `object_create`
- `retrieve`
- `engine_check`

Legacy tool names such as `store`, `update`, `delete`, `query`, `query_graph`, `upsert_entity`, and `resolve_conflict` are not part of this public surface.

## Tools

| Tool | Description |
|---|---|
| `link_object` | Create or update an explicit triple between stored objects |
| `object_create` | Create a `note` or `entity` with provenance, validity, tags, and optional related links |
| `retrieve` | Unified retrieval across notes, entities, and links |
| `engine_check` | Inspect tool help, instance status, transaction history, baked auto-update status, and one-time auto-update links |

## Tool Details

### `link_object`

Required:

- `subject`
- `predicate`
- `object`

Optional:

- `valid_from`
- `valid_to`
- `confidence`
- `source`

### `object_create`

Required:

- `kind`
- `payload`

`kind="note"` payload:

- `body`

`kind="entity"` payload:

- `name`

Optional top-level fields:

- `entity_type`
- `links`
- `source`
- `confidence`
- `valid_from`
- `valid_to`
- `tags`
- `produced_by`
- `about`
- `affects`
- `specificity`

### `retrieve`

Required:

- `query`

Optional:

- `limit`
- `as_of`
- `include_links`
- `include_auto_links`

`retrieve` searches across all stored knowledge and returns a mixed result set. Clients do not need to predict whether the best match is a note, entity, or link.

Corrections are modeled by creating new objects and linking them with `supersedes`, or by linking objects to `deleted`.

### `engine_check`

Required:

- `action`

Optional:

- `target`
- `limit`
- `cursor`

Supported `action` values:

- `help`
- `status`
- `history`
- `auto_updates_status`
- `enable_auto_updates`

## Resources (Paginated, Cursor-Based)

- `knowledge://entries` - all entries
- `knowledge://graph/triples` - all triples
- `knowledge://history/transactions` - transaction log

## Prompts

- `ingest-memory` - guide for storing knowledge with provenance
- `retrieve-context` - guide for unified retrieval, pagination, and link expansion
- `correct-stale-facts` - guide for superseding stale facts and linking objects to `deleted`

## Two-Axis Model

See [knowledge-model.md](./knowledge-model.md) for:

- The 9 `knowledge_type` values with examples
- The 3 `memory_type` values and promotion rules
- Fixed promotion predicates: `supported_by`, `grounded_by`, `derived_from`
