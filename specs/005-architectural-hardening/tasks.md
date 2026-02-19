# Tasks 005: Architectural Hardening

## Prerequisites

- Codebase cloned from `github.com/rudavko/lore-mcp`
- `bun install` completed
- `bun test` passes clean before starting

## Ordered Checklist

Tasks are ordered so each builds on the previous. Complete and verify each before proceeding. Never modify `migrations/0001_full_schema.sql`.

> Note: phase numbers indicate execution order, not workstream IDs.
> Phase 2 -> Workstream 4 (validation), Phase 3 -> Workstream 2 (Vectorize/D1 delete sync), Phase 4 -> Workstream 5 (UNIQUE constraints), Phase 5 -> Workstream 3 (conflict durability), Phase 6 -> Workstream 1 (cursor pagination), Phase 7 -> Workstream 6 (`topic || content` fix).

---

### Phase 1 — Test Harness (unblocks all tool-layer tests)

- [ ] **1.1** Create `src/mcp/tools.test.ts` with the `createToolHarness()` stub described in `plan.md`. Import `createD1Mock`, `initSchema`, `resetPolicy`, `registerTools`. Add a `beforeEach` that creates a fresh in-memory DB and calls `initSchema`. Do not add any test cases yet — just the harness and one smoke test: `test("store tool registers without throwing")` that calls `tools.call("store", { topic: "t", content: "c" })` and asserts `result.isError` is falsy.
- [ ] **1.2** Run `bun test src/mcp/tools.test.ts` — must pass before proceeding.

---

### Phase 2 — Workstream 4: Shared Validation on Update Paths (smallest, highest-confidence change)

- [ ] **2.1** In `src/db/entries.ts`, extract a `validateEntryFields({ topic?, content? })` function above `createEntry`. It throws `KnowledgeError.validation(...)` when `topic` exceeds `MAX_TOPIC_LENGTH` or `content` exceeds `MAX_CONTENT_LENGTH`. Use `!== undefined` guards so partial updates only validate the fields being changed.
- [ ] **2.2** Replace the two inline length checks at the top of `createEntry` with a call to `validateEntryFields({ topic: params.topic, content: params.content })`.
- [ ] **2.3** Add a call to `validateEntryFields({ topic: params.topic, content: params.content })` at the top of `updateEntry` (before the DB fetch).
- [ ] **2.4** In `src/db/triples.ts`, extract a `validateTripleFields({ subject?, predicate?, object? })` function above `createTriple`. Throws `KnowledgeError.validation(...)` for any field exceeding `MAX_FIELD_LENGTH`. Use `!== undefined` guards.
- [ ] **2.5** Replace the three inline length checks at the top of `createTriple` with a call to `validateTripleFields({ subject: params.subject, predicate: params.predicate, object: params.object })`.
- [ ] **2.6** Add a call to `validateTripleFields({ predicate: params.predicate, object: params.object })` at the top of `updateTriple`. Note: `subject` is not updatable in `updateTriple`, so omit it.
- [ ] **2.7** Add tests to `src/db.test.ts` inside the existing `"length validation"` describe block:
    - `"updateEntry rejects topic exceeding max length"` — create entry, call `updateEntry` with `"x".repeat(1001)` as topic, expect rejection with message containing `"exceeds"`.
    - `"updateEntry rejects content exceeding max length"` — same pattern with `"x".repeat(100_001)`.
    - `"updateEntry accepts partial update without validation error"` — create entry with long topic `"x".repeat(1000)`, update only `content: "new"`, expect success.
    - `"updateTriple rejects object exceeding max length"` — create triple, update with `"x".repeat(2001)` object, expect rejection.
    - `"updateTriple rejects predicate exceeding max length"` — same pattern for predicate.
- [ ] **2.8** Run `bun test` — all existing tests must still pass plus the new ones.

---

### Phase 3 — Workstream 2: Vectorize / D1 Delete Synchronization

- [ ] **3.1** In `src/db/search.ts`, find the final hydration query in `hybridSearch` (currently `SELECT * FROM entries WHERE id IN (...)`). Add `AND deleted_at IS NULL` to that query. The exact line is inside the `if (page.length === 0)` early-return guard — it is the only `SELECT * FROM entries WHERE id IN` in this file.
- [ ] **3.2** Add tests to `src/db.test.ts` inside the existing `"search"` describe block:
    - `"hybridSearch excludes soft-deleted entries from lexical results"` — create entry, delete it, call `hybridSearch` with matching query, assert entry ID not in results.
    - `"hybridSearch excludes soft-deleted entries even when injected via semantic mock"` — create entry, delete it, call `hybridSearch` with a `mockVectorize` that returns the deleted entry ID with score 0.99, assert entry ID not in results. Use the `createMockAi()` and `createMockVectorize()` helpers already defined in `src/db.test.ts`.
- [ ] **3.3** In `src/mcp/tools.ts`, in the `"delete"` tool handler, after the `deleteEntry` or `deleteTriple` call succeeds, add a non-fatal Vectorize cleanup:
    ```typescript
    if (type === "entry" && env.VECTORIZE_INDEX) {
	env.VECTORIZE_INDEX.deleteByIds([id]).catch((e) => {
		logEvent("vectorize_delete_failed", { id, error: String(e) });
	});
    }
    ```
- [ ] **3.4** Run `bun test` — all tests must pass.

---

### Phase 4 — Workstream 5: Schema UNIQUE Constraints

- [ ] **4.1** Create `migrations/0002_unique_constraints.sql`:

    ```sql
    -- Unique entity names (stored as provided; application resolves case via aliases)
    CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_entities_name
      ON canonical_entities(name);

    -- Unique aliases (always stored lowercase by application)
    CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_alias
      ON entity_aliases(alias);
    ```

- [ ] **4.2** In `src/db/schema.ts`, inside the `initSchema` `db.batch([...])` call, add two statements after the existing table creation statements (before `initFts5`):
    ```typescript
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_entities_name ON canonical_entities(name)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_alias ON entity_aliases(alias)`),
    ```
- [ ] **4.3** In `src/db/entities.ts`, wrap the `db.batch([...])` in `createEntity` in a try/catch. Catch errors where `String(e).includes("UNIQUE")` and rethrow as `KnowledgeError.conflict(\`Entity "${name}" already exists\`)`. Re-throw all other errors as-is.
- [ ] **4.4** In `src/db/entities.ts`, wrap the `db.batch([...])` in `addAlias` in a try/catch. Catch UNIQUE errors and rethrow as `KnowledgeError.conflict(\`Alias "${alias.toLowerCase()}" is already in use\`)`.
- [ ] **4.5** Add tests to `src/db.test.ts` inside the existing `"entities"` describe block:
    - `"createEntity throws conflict on duplicate name"` — call `createEntity(db, "Duplicate")` twice, expect second to throw with message containing `"already exists"`.
    - `"addAlias throws conflict when alias already in use by another entity"` — create two entities, add alias `"shared"` to first, attempt to add same alias to second, expect throw with `"already in use"`.
    - `"upsertEntity does not throw on existing name (resolves via alias)"` — call `upsertEntity(db, "Existing")` twice, expect second to return `created: false` without throwing.
- [ ] **4.6** Run `bun test` — all tests must pass. Pay attention that the `"entities"` describe block's existing tests still pass; the unique constraints must not break any existing behaviour since `upsertEntity` already guards correctly.

---

### Phase 5 — Workstream 3: Conflict Durability via D1

- [ ] **5.1** Create `migrations/0003_conflicts_table.sql`:

    ```sql
    CREATE TABLE IF NOT EXISTS conflicts (
      conflict_id TEXT PRIMARY KEY,
      scope       TEXT NOT NULL,
      data        TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conflicts_expires ON conflicts(expires_at);
    ```

- [ ] **5.2** In `src/db/schema.ts`, inside the `initSchema` `db.batch([...])`, add the conflicts table creation statement (after existing tables, before unique indexes from 4.2):
    ```typescript
    db.prepare(`CREATE TABLE IF NOT EXISTS conflicts (
      conflict_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_conflicts_expires ON conflicts(expires_at)`),
    ```
- [ ] **5.3** In `src/mcp/tools.ts`, replace the `saveConflict` / `loadConflict` / `removeConflict` inner functions with the D1-backed implementations from `plan.md`. Key points:
    - `saveConflict`: `INSERT OR REPLACE INTO conflicts` with `expires_at = new Date(Date.now() + CONFLICT_TTL_MS).toISOString()`. Also write to DO storage as fast path if `storage` is present (non-fatal).
    - `loadConflict`: try DO storage first (check `storedAt + CONFLICT_TTL_MS > Date.now()`). On miss or expiry, query D1. If D1 row has `expires_at < now`, delete it and return `null`. Parse `row.data` as `ConflictInfo`.
    - `removeConflict`: `DELETE FROM conflicts WHERE conflict_id = ?`. Also delete from DO storage if present.
- [ ] **5.4** In `src/index.ts`, in `MyMCP.init()`, after `await initSchema(this.env.DB)`, add expired conflict cleanup:
    ```typescript
    await this.env.DB.prepare(`DELETE FROM conflicts WHERE expires_at < ?`)
	.bind(new Date().toISOString())
	.run();
    ```
- [ ] **5.5** Add tests to `src/mcp/tools.test.ts` in a `"resolve_conflict"` describe block. Use the `createToolHarness()` from Phase 1. Before each test, use `createTriple` to set up an existing triple, then call the `"relate"` tool with a conflicting object to produce a real conflict ID from the response:
    - `"reject strategy: no DB changes, resolved: true in response"` — relate to get conflict, call resolve with `strategy: "reject"`, assert original triple unchanged, assert `resolved: true` in response JSON.
    - `"replace strategy: updates existing triple object"` — relate to get conflict, call resolve with `strategy: "replace"`, query triple by ID, assert object is the incoming value.
    - `"retain_both strategy: creates new triple alongside existing"` — relate to get conflict, call resolve with `strategy: "retain_both"`, query triples by subject+predicate, assert two triples exist with different objects.
    - `"unknown conflict_id returns not_found error"` — call resolve with `conflict_id: "nonexistent"`, assert `result.isError` and error code is `"not_found"`.
    - `"expired conflict returns not_found"` — directly `INSERT INTO conflicts` with `expires_at` set to a past datetime, call resolve with that ID, assert `result.isError` and error code `"not_found"`.
- [ ] **5.6** Run `bun test` — all tests must pass.

---

### Phase 6 — Workstream 1: Cursor Pagination on All List-Returning Tools

This is the largest workstream. Complete sub-tasks in order.

#### 6A — `queryEntries` pagination

- [ ] **6A.1** In `src/db/entries.ts`, update `QueryEntryParams` to add `cursor?: string`.
- [ ] **6A.2** Change the return type of `queryEntries` to `Promise<{ items: Entry[]; next_cursor: string | null }>`.
- [ ] **6A.3** Implement cursor in the SQL query: decode cursor with `decodeCursor(params.cursor)` (import from `../lib/format`). When a cursor ID is present, add `AND id < ?` to the WHERE conditions and prepend the cursor ID to `binds`.
- [ ] **6A.4** When `hasTags`: set SQL LIMIT to `Math.min(limit * 10, 2000)` instead of no limit. After JS tag filtering and slicing to `limit`, compute `next_cursor = items.length >= limit ? btoa(items[items.length - 1].id) : null`.
- [ ] **6A.5** When `!hasTags`: fetch `limit + 1` rows. `next_cursor = results.length > limit ? btoa(results[limit - 1].id) : null`. Slice `items` to `limit`.
- [ ] **6A.6** Return `{ items, next_cursor }`.
- [ ] **6A.7** Add tests to `src/db.test.ts` inside the `"entries"` describe block:
    - `"queryEntries returns next_cursor when more results exist"` — create 5 entries, query with `limit: 2`, assert `next_cursor` is not null.
    - `"queryEntries cursor yields non-overlapping second page"` — create 5 entries, get page 1 with `limit: 2`, get page 2 using `cursor: page1.next_cursor`, assert no ID overlap.
    - `"queryEntries returns null next_cursor on last page"` — create 2 entries, query with `limit: 5`, assert `next_cursor` is null.
    - `"queryEntries with tags returns bounded results and next_cursor"` — create 10 entries tagged `["x"]` and 10 untagged, query with `tags: ["x"], limit: 3`, assert `items.length === 3` and `next_cursor` is not null.

#### 6B — `queryTriples` pagination

- [ ] **6B.1** In `src/db/triples.ts`, update `QueryTripleParams` to add `cursor?: string`.
- [ ] **6B.2** Change return type of `queryTriples` to `Promise<{ items: Triple[]; next_cursor: string | null }>`.
- [ ] **6B.3** Decode cursor, add `AND id < ?` when present. Fetch `limit + 1` rows. Set `next_cursor = results.length > limit ? btoa(results[limit - 1].id) : null`. Slice items to `limit`.
- [ ] **6B.4** Add tests to `src/db.test.ts` inside the `"triples"` describe block:
    - `"queryTriples returns next_cursor when more results exist"`
    - `"queryTriples cursor yields non-overlapping second page"`
    - `"queryTriples returns null next_cursor on last page"`

#### 6C — `getHistory` pagination

- [ ] **6C.1** In `src/db/history.ts`, update `getHistory` params to add `cursor?: string`. Change return type to `Promise<{ items: Transaction[]; next_cursor: string | null }>`.
- [ ] **6C.2** Decode cursor, add `AND id < ?` when present (prepend to the conditions array). Fetch `limit + 1`. Compute `next_cursor`. Return `{ items, next_cursor }`.
- [ ] **6C.3** Add tests to `src/db.test.ts` inside the `"history"` describe block:
    - `"getHistory returns next_cursor when more results exist"`
    - `"getHistory cursor yields non-overlapping second page"`

#### 6D — Wire pagination into tools

- [ ] **6D.1** In `src/mcp/tools.ts`, update the `"query_graph"` tool schema to add `cursor: z.string().optional().describe("Pagination cursor from previous response")`.
- [ ] **6D.2** Update the `"query_graph"` handler to pass `cursor` to `queryTriples` and surface `next_cursor` in the response data object.
- [ ] **6D.3** Update the `"history"` tool schema to add `cursor: z.string().optional().describe("Pagination cursor from previous response")`.
- [ ] **6D.4** Update the `"history"` handler to pass `cursor` to `getHistory` and surface `next_cursor` in the response data object.
- [ ] **6D.5** Update the `"query"` tool fallback path (currently `queryEntries` followed by `next_cursor: null`): destructure the new `{ items, next_cursor }` result and pass both to `formatResult`.
- [ ] **6D.6** Add tests to `src/mcp/tools.test.ts`:
    - `"query_graph cursor returns next_cursor when more triples exist"` — create 5 triples with same subject, call `query_graph` with `limit: 2`, assert `next_cursor` in response JSON is not null.
    - `"query_graph cursor second page does not overlap first"` — create 5 triples, page 1 with cursor, page 2 with cursor from page 1, assert no ID overlap.
    - `"history cursor returns next_cursor when more transactions exist"` — create 5 entries (produces 5 transactions), call `history` with `limit: 2`, assert `next_cursor` not null.
    - `"query tag-only path returns next_cursor"` — create 5 entries tagged `["t"]`, call `query` with `tags: ["t"], limit: 2`, assert `next_cursor` not null.

#### 6E — Fix callers of changed signatures

- [ ] **6E.1** Search the codebase for all other callers of `queryEntries`, `queryTriples`, and `getHistory`. As of this writing these are: `mcp/resources.ts` (does not call any of these — uses raw SQL directly, no change needed) and `mcp/tools.ts` (already updated in 6D). Verify with: `grep -rn "queryEntries\|queryTriples\|getHistory" src/` and confirm no remaining callers return `.items` without handling `next_cursor`.
- [ ] **6E.2** Run `bun test` — all tests must pass, including the existing test suite.

---

### Phase 7 — Workstream 6: Fix `topic || content` Query Collapse

- [ ] **7.1** In `src/mcp/tools.ts`, in the `"query"` tool handler, replace:
    ```typescript
    const queryText = topic || content;
    ```
    with:
    ```typescript
    const queryText = [topic, content].filter(Boolean).join(" ") || undefined;
    ```
- [ ] **7.2** Update the `"query"` tool `topic` param description to: `"Filter by topic (substring). Combined with content if both are provided."`. Update `content` param description similarly.
- [ ] **7.3** Add test to `src/mcp/tools.test.ts`:
    - `"query with both topic and content combines both terms"` — create two entries: `{ topic: "alpha training", content: "vo2max" }` and `{ topic: "alpha", content: "unrelated" }`. Call `query` tool with `{ topic: "alpha", content: "vo2max", limit: 10 }`. Assert both entries are in results (not just the one matching topic alone).
- [ ] **7.4** Run `bun test` — all tests must pass.

---

### Phase 8 — README Update

- [ ] **8.1** In `README.md`, under "Known Limitations", remove the bullet:
    > `LIKE` wildcards not escaped. `%` and `_` in search input are passed through to SQL LIKE clauses.
- [ ] **8.2** In `README.md`, under "Known Limitations", add:
    > **Tag pagination is approximate.** When filtering by tags only (no topic or content), pagination may skip some matching entries at very low tag selectivity. For exhaustive tag-based export, use the `knowledge://entries` resource and filter client-side.
- [ ] **8.3** In `README.md`, in the Tools table, update the `query` row description to reflect that `topic` and `content` are combined when both are provided.
- [ ] **8.4** In `README.md`, update `query_graph` and `history` tool rows to note cursor pagination support.

---

### Phase 9 — Final Validation

- [ ] **9.1** Run `bun test` — full suite must pass with zero failures.
- [ ] **9.2** Run `bun run type-check` — zero TypeScript errors.
- [ ] **9.3** Verify `bun run lint:fix` produces no errors (or only pre-existing ones unrelated to this spec).
- [ ] **9.4** Verify all migration files are in correct order: `0001_full_schema.sql`, `0002_unique_constraints.sql`, `0003_conflicts_table.sql`.
- [ ] **9.5** Manually verify acceptance criteria for each user story in `spec.md` against the test suite.
- [ ] **9.6** Update `specs/005-architectural-hardening/status.json` — set all stories to `"completed"` and `implementation` phase to `"completed"`.
- [ ] **9.7** Update `specs/README.md` — add spec 005 to the index table with state `"implementation_complete"`.

---

## Verification Checklist

- [ ] `bun test` passes with zero failures
- [ ] `queryEntries`, `queryTriples`, `getHistory` all return `{ items, next_cursor }` — no caller receives a bare array
- [ ] `query_graph` and `history` tools accept `cursor` param and return `next_cursor`
- [ ] `query` tool with `tags` only returns `next_cursor` (not hardcoded `null`)
- [ ] Deleted entry does not appear in `hybridSearch` results even when returned by a mock Vectorize
- [ ] `resolve_conflict` succeeds when called with a `conflict_id` from a fresh tool harness instance (simulates DO re-routing)
- [ ] `updateEntry` with a 1001-char topic throws `validation` error
- [ ] `updateTriple` with a 2001-char object throws `validation` error
- [ ] `createEntity("X")` called twice throws `conflict` error on second call
- [ ] `addAlias` with an alias already in use throws `conflict` error
- [ ] Migration files exist: `0002_unique_constraints.sql`, `0003_conflicts_table.sql`
- [ ] README stale limitation bullet removed
