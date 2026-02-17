# Spec 002: MCP UX Contracts and Structured Responses

## Problem Statement

The current server is functional but returns most tool results as JSON encoded inside text. This limits machine reliability, weakens client-side UX rendering, and increases prompt burden for agents.

## Goals

1. Provide structured, typed tool outputs for all core knowledge and graph operations.
2. Add MCP resources for discoverable read surfaces and optional subscriptions.
3. Add MCP prompts that guide common workflows for users and agents.
4. Standardize error shapes so clients can render actionable failures consistently.

## Non-Goals

1. Building a separate web dashboard.
2. Introducing cross-tenant access control models.
3. Replacing existing OAuth/Auth flows.

## User Stories

### US-002-001 Scenario: Claude Desktop renders a query result

Acceptance Criteria:

- Given a client calls `store`, `update`, `query`, `delete`, `relate`, `query_graph`, `undo`, or `history`
- When the tool returns successfully
- Then the response includes schema-aligned structured output for programmatic parsing

- Given a client renders tool output
- When structured output is present
- Then it can present user-friendly summaries without reparsing free-form text

### US-002-002 Scenario: Automated pipeline handles a failed store operation

Acceptance Criteria:

- Given a tool invocation fails validation
- When the server returns an error
- Then the payload includes a stable error code and human-readable message

- Given a transient or dependency failure occurs
- When the server returns an error
- Then the payload indicates retryability in a machine-readable field

### US-002-003 Scenario: Agent browses entries via resource discovery

Acceptance Criteria:

- Given a client calls `resources/list`
- When the server responds
- Then it advertises at least the following resources:
- And it includes a stable `uri` for each:
  - `knowledge://entries`
  - `knowledge://graph/triples`
  - `knowledge://history/transactions`
- And each advertised resource includes `uri`, `name`, `description`, `mime_type` set to `application/json`, and a `version` integer

- Given a client reads one of the advertised resources with optional pagination parameters (`limit` and `cursor`)
- When the request is valid
- Then the server returns a structured JSON object containing `resource_uri`, `as_of_tx_id`, `items`, and `next_cursor`
- And `next_cursor` is `null` when no further pages exist

### US-002-004 Scenario: Dashboard subscribes to entry changes

Acceptance Criteria:

- Given a client subscribes to a supported resource
- When new data matching the resource is committed
- Then the client receives change notifications that include `resource_uri`, `tx_id`, `change_type`, and `changed_ids`
- And `change_type` is one of `upsert` or `delete`
- And `changed_ids` is a bounded list suitable for incremental refresh (clients can follow up with a resource read)

- Given a client unsubscribes from a resource
- When unsubscription succeeds
- Then the server acknowledges unsubscription
- And no further notifications are sent for that subscription after acknowledgement

### US-002-005 Scenario: New user follows a guided memory workflow

Acceptance Criteria:

- Given a client calls `prompts/list`
- When the server responds
- Then it exposes prompts for ingesting memory, retrieving context, and correcting stale facts

- Given a client calls `prompts/get` for one of these prompts
- When prompt arguments are supplied
- Then the server returns a complete, ready-to-run prompt template

## Example Payloads

### Structured `query` response (US-002-001)

A `query` tool call returns both a human-readable text block and a machine-readable resource block. This uses the MCP SDK v1.26.0 `text` + `resource` content pattern (`EmbeddedResourceSchema`).

```jsonc
// Tool result content array for: query({ topic: "deployment" })
[
  {
    "type": "text",
    "text": "Found 2 entries matching \"deployment\"."
  },
  {
    "type": "resource",
    "resource": {
      "uri": "knowledge://entries?topic=deployment",
      "mimeType": "application/json",
      "text": "{\"items\":[{\"id\":\"e-42\",\"topic\":\"deployment\",\"content\":\"Use blue-green deploys for zero-downtime releases.\",\"confidence\":0.92,\"recorded_at\":\"2026-02-10T14:30:00Z\"},{\"id\":\"e-87\",\"topic\":\"deployment rollback\",\"content\":\"Rollback within 5 min if error rate exceeds 1%.\",\"confidence\":0.85,\"recorded_at\":\"2026-02-12T09:15:00Z\"}],\"next_cursor\":null}"
    }
  }
]
```

## Edge Cases and Constraints

1. Structured outputs must remain backward-compatible enough for text-only clients.
2. Resource list size should remain bounded and predictable.
3. Error schemas must avoid leaking sensitive auth or internal stack details.
4. Prompt templates must not imply writes without explicit tool calls.

## Alternatives Considered

1. **Keep JSON-in-text, let clients parse.** Rejected: fragile regex/substring extraction, undiscoverable schema, breaks when output format drifts.
2. **GraphQL layer on top of MCP.** Rejected: adds a second protocol alongside MCP, increases client complexity. MCP resources already provide discoverable read surfaces.

## Success Metrics

1. Parsing failures in client integrations drop versus baseline JSON-in-text behavior.
2. At least one primary MCP client can render structured outputs without custom parsing glue.
3. Resource/prompt discovery paths are used in integration tests and pass consistently.
