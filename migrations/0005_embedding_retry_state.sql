-- Persist embedding lifecycle so retries and terminal failure are durable.
ALTER TABLE entries ADD COLUMN embedding_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE entries ADD COLUMN embedding_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN embedding_last_error TEXT;
ALTER TABLE entries ADD COLUMN embedding_last_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_embedding_status ON entries(embedding_status);

-- Backfill existing rows as ready (legacy entries have already been written).
UPDATE entries
SET embedding_status = 'ready',
	embedding_retry_count = 0
WHERE embedding_status IS NULL;
