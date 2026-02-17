# Tasks 002: MCP UX Contracts and Structured Responses

## Ordered Checklist

1. [ ] Define output schemas for all existing tools and map current responses.
2. [ ] Implement structured success envelopes for `store`, `update`, `query`, `delete`, `relate`, `query_graph`, `undo`, and `history`.
3. [ ] Introduce standardized typed error payloads with stable error codes.
4. [ ] Register MCP resources for entries, triples, and transaction history.
5. [ ] Implement resource read handlers with structured metadata and content.
6. [ ] Add resource subscription support where transport supports notifications.
7. [ ] Register MCP prompt templates for ingest, retrieve, and correction workflows.
8. [ ] Add integration tests for structured outputs, resource discovery, and prompt discovery.
9. [ ] Update README/tooling docs with contract examples and migration notes.
10. [ ] Validate acceptance criteria and update `status.yaml`.

## Verification Checklist

1. [ ] All core tool responses validate against declared output schemas.
2. [ ] Error responses contain code/message/retryable fields where expected.
3. [ ] `resources/list` and resource reads work in at least one MCP client.
4. [ ] `prompts/list` and `prompts/get` return usable prompt definitions.
5. [ ] Existing text-only user flows remain functional during migration.

