-- Full schema for the knowledge server (pre-release, no migration needed).
-- Includes provenance (003), entities (003), ingestion (004), and indexes.

CREATE TABLE IF NOT EXISTS transactions (
	id TEXT PRIMARY KEY,
	op TEXT NOT NULL,
	entity_type TEXT NOT NULL,
	entity_id TEXT NOT NULL,
	before_snapshot TEXT,
	after_snapshot TEXT,
	reverted_by TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entries (
	id TEXT PRIMARY KEY,
	topic TEXT NOT NULL,
	content TEXT NOT NULL,
	tags TEXT NOT NULL DEFAULT '[]',
	source TEXT,
	actor TEXT,
	confidence REAL,
	valid_from TEXT,
	valid_to TEXT,
	status TEXT NOT NULL DEFAULT 'active',
	canonical_entity_id TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS triples (
	id TEXT PRIMARY KEY,
	subject TEXT NOT NULL,
	predicate TEXT NOT NULL,
	object TEXT NOT NULL,
	source TEXT,
	actor TEXT,
	confidence REAL,
	valid_from TEXT,
	valid_to TEXT,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS canonical_entities (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_aliases (
	id TEXT PRIMARY KEY,
	alias TEXT NOT NULL,
	canonical_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingestion_tasks (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'pending',
	input_uri TEXT,
	total_items INTEGER NOT NULL DEFAULT 0,
	processed_items INTEGER NOT NULL DEFAULT 0,
	error TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entries_topic ON entries(topic);
CREATE INDEX IF NOT EXISTS idx_entries_canonical_entity ON entries(canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject);
CREATE INDEX IF NOT EXISTS idx_triples_predicate ON triples(predicate);
CREATE INDEX IF NOT EXISTS idx_triples_status ON triples(status);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity ON entity_aliases(canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_status ON ingestion_tasks(status);
