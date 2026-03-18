-- Add TTL support for entries by persisting absolute expiry timestamps.
ALTER TABLE entries ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_expires_at ON entries(expires_at);
