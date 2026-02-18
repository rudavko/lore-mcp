-- Add missing unique constraint for canonical entity names on already-migrated DBs.
-- 0001 was already applied in existing environments and is not re-run.

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_entities_name ON canonical_entities(name);
