CREATE TABLE IF NOT EXISTS conflicts (
	conflict_id TEXT PRIMARY KEY,
	scope       TEXT NOT NULL,
	data        TEXT NOT NULL,
	created_at  TEXT NOT NULL,
	expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conflicts_expires ON conflicts(expires_at);
