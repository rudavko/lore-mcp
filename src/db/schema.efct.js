/** @implements FR-001 — Schema initialization for all knowledge server tables. */
export async function initSchema(db) {
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
			embedding_status TEXT NOT NULL DEFAULT 'ready',
			embedding_retry_count INTEGER NOT NULL DEFAULT 0,
			embedding_last_error TEXT,
			embedding_last_attempt_at TEXT,
			valid_from TEXT,
			valid_to TEXT,
			valid_to_state TEXT NOT NULL DEFAULT 'unspecified',
			expires_at TEXT,
			status TEXT NOT NULL DEFAULT 'active',
			knowledge_type TEXT NOT NULL DEFAULT 'observation',
			memory_type TEXT NOT NULL DEFAULT 'fleeting',
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
			valid_to_state TEXT NOT NULL DEFAULT 'unspecified',
			status TEXT NOT NULL DEFAULT 'active',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			deleted_at TEXT
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS canonical_entities (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			entity_type TEXT,
			source TEXT,
			confidence REAL,
			valid_from TEXT,
			valid_to TEXT,
			valid_to_state TEXT NOT NULL DEFAULT 'unspecified',
			tags TEXT NOT NULL DEFAULT '[]',
			produced_by TEXT,
			about TEXT,
			affects TEXT,
			specificity TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
		db.prepare(`CREATE TABLE IF NOT EXISTS conflicts (
			conflict_id TEXT PRIMARY KEY,
			scope TEXT NOT NULL,
			data TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			expires_at TEXT NOT NULL
		)`),
		db.prepare(
			`CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_entities_name ON canonical_entities(name)`,
		),
		db.prepare(
			`CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_alias ON entity_aliases(alias)`,
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_conflicts_expires ON conflicts(expires_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_entries_expires_at ON entries(expires_at)`),
	]);
	await ensureEntryColumns(db);
	await ensureEntityColumns(db);
	await initFts5(db);
}
async function ensureEntryColumns(db) {
	const { results } = await db.prepare(`PRAGMA table_info(entries)`).all();
	const names = {};
	for (let i = 0; i < results.length; i++) {
		const name = results[i].name;
		if (typeof name === "string") {
			names[name] = true;
		}
	}
	const statements = [];
	if (names.knowledge_type !== true) {
		statements.push(
			db.prepare(
				`ALTER TABLE entries ADD COLUMN knowledge_type TEXT NOT NULL DEFAULT 'observation'`,
			),
		);
	}
	if (names.memory_type !== true) {
		statements.push(
			db.prepare(
				`ALTER TABLE entries ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'fleeting'`,
			),
		);
	}
	if (statements.length > 0) {
		await db.batch(statements);
	}
}
async function ensureEntityColumns(db) {
	const { results } = await db.prepare(`PRAGMA table_info(canonical_entities)`).all();
	const names = {};
	for (let i = 0; i < results.length; i++) {
		const name = results[i].name;
		if (typeof name === "string") {
			names[name] = true;
		}
	}
	const statements = [];
	const addColumn = (name, sql) => {
		if (names[name] !== true) {
			statements.push(db.prepare(sql));
		}
	};
	addColumn("entity_type", `ALTER TABLE canonical_entities ADD COLUMN entity_type TEXT`);
	addColumn("source", `ALTER TABLE canonical_entities ADD COLUMN source TEXT`);
	addColumn("confidence", `ALTER TABLE canonical_entities ADD COLUMN confidence REAL`);
	addColumn("valid_from", `ALTER TABLE canonical_entities ADD COLUMN valid_from TEXT`);
	addColumn("valid_to", `ALTER TABLE canonical_entities ADD COLUMN valid_to TEXT`);
	addColumn(
		"valid_to_state",
		`ALTER TABLE canonical_entities ADD COLUMN valid_to_state TEXT NOT NULL DEFAULT 'unspecified'`,
	);
	addColumn("tags", `ALTER TABLE canonical_entities ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
	addColumn("produced_by", `ALTER TABLE canonical_entities ADD COLUMN produced_by TEXT`);
	addColumn("about", `ALTER TABLE canonical_entities ADD COLUMN about TEXT`);
	addColumn("affects", `ALTER TABLE canonical_entities ADD COLUMN affects TEXT`);
	addColumn("specificity", `ALTER TABLE canonical_entities ADD COLUMN specificity TEXT`);
	addColumn("updated_at", `ALTER TABLE canonical_entities ADD COLUMN updated_at TEXT`);
	if (statements.length > 0) {
		await db.batch(statements);
	}
	if (names.updated_at !== true) {
		await db
			.prepare(
				`UPDATE canonical_entities
				 SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
				 WHERE updated_at IS NULL`,
			)
			.run();
	}
}
async function initFts5(db) {
	try {
		await db
			.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
				topic, content, tags,
				content=entries, content_rowid=rowid
			)`)
			.run();
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
	} catch {
		// FTS5 not available in this environment — non-fatal
	}
}
