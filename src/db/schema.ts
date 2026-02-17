// Schema initialization for the knowledge server.
// In production, wrangler migrations handle schema creation.
// This initSchema() is used for local dev and testing with in-memory DBs.

// Track whether FTS5 is available (detected once per process)
let fts5Available: boolean | null = null;

export async function initSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			op TEXT NOT NULL,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			before_snapshot TEXT,
			after_snapshot TEXT,
			reverted_by TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS entries (
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
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS triples (
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
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS canonical_entities (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS entity_aliases (
			id TEXT PRIMARY KEY,
			alias TEXT NOT NULL,
			canonical_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS ingestion_tasks (
			id TEXT PRIMARY KEY,
			status TEXT NOT NULL DEFAULT 'pending',
			input_uri TEXT,
			total_items INTEGER NOT NULL DEFAULT 0,
			processed_items INTEGER NOT NULL DEFAULT 0,
			error TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
	]);

	// Try to create FTS5 virtual table (both D1 and bun:sqlite support FTS5)
	await initFts5(db);
}

async function initFts5(db: D1Database): Promise<void> {
	if (fts5Available === false) return;

	try {
		// Content-sync FTS5: external content table pointing to entries
		await db.prepare(
			`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
				topic, content, tags,
				content=entries, content_rowid=rowid
			)`,
		).run();

		// Triggers to keep FTS in sync with entries table
		await db.batch([
			db.prepare(`CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
				INSERT INTO entries_fts(rowid, topic, content, tags) VALUES (NEW.rowid, NEW.topic, NEW.content, NEW.tags);
			END`),
			db.prepare(`CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
				INSERT INTO entries_fts(entries_fts, rowid, topic, content, tags) VALUES('delete', OLD.rowid, OLD.topic, OLD.content, OLD.tags);
			END`),
			db.prepare(`CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries BEGIN
				INSERT INTO entries_fts(entries_fts, rowid, topic, content, tags) VALUES('delete', OLD.rowid, OLD.topic, OLD.content, OLD.tags);
				INSERT INTO entries_fts(rowid, topic, content, tags) VALUES (NEW.rowid, NEW.topic, NEW.content, NEW.tags);
			END`),
		]);

		fts5Available = true;
	} catch {
		// FTS5 not available in this environment (e.g. bun:sqlite test builds)
		fts5Available = false;
	}
}

export function isFts5Available(): boolean {
	return fts5Available === true;
}
