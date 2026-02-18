-- Persist relate/resolve_conflict state across Durable Object contexts.
-- TTL is enforced by expires_at (unix epoch milliseconds).

CREATE TABLE IF NOT EXISTS pending_conflicts (
	id TEXT PRIMARY KEY,
	payload TEXT NOT NULL,
	expires_at INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_conflicts_expires_at ON pending_conflicts(expires_at);
