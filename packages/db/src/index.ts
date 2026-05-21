export type Migration = {
  id: string
  description: string
  up: string[]
}

export const dbMigrations: Migration[] = [
  {
    id: '0001_initial_library',
    description: 'Create initial local library tables.',
    up: [
      `CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        title TEXT,
        authors_json TEXT,
        year INTEGER,
        doi TEXT,
        arxiv_id TEXT,
        venue TEXT,
        abstract TEXT,
        file_path TEXT,
        fingerprint TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        page_no INTEGER NOT NULL,
        type TEXT NOT NULL,
        color TEXT,
        quad_points_json TEXT,
        selected_text TEXT,
        note TEXT,
        tags_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        paper_id TEXT,
        type TEXT NOT NULL,
        title TEXT,
        content TEXT,
        ref_id TEXT,
        source_refs_json TEXT,
        position_json TEXT,
        style_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );`
    ]
  },
  {
    id: '0002_notes',
    description: 'Create structured note tables.',
    up: [
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        type TEXT,
        paper_id TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS note_blocks (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        parent_id TEXT,
        type TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        content_json TEXT,
        markdown TEXT,
        source_refs_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_note_blocks_note_order
        ON note_blocks (note_id, order_index);`
    ]
  },
  {
    id: '0003_note_system_extensions',
    description: 'Create note template, link, and revision tables.',
    up: [
      `CREATE TABLE IF NOT EXISTS note_templates (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        field_schema_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS note_links (
        id TEXT PRIMARY KEY,
        source_note_id TEXT NOT NULL,
        source_block_id TEXT,
        target_note_id TEXT,
        target_block_id TEXT,
        relation TEXT NOT NULL,
        source_refs_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_note_links_source_note
        ON note_links (source_note_id, relation);`,
      `CREATE INDEX IF NOT EXISTS idx_note_links_target_note
        ON note_links (target_note_id, relation);`,
      `CREATE TABLE IF NOT EXISTS note_revisions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        revision_index INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        change_summary TEXT,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_note_revisions_note_revision
        ON note_revisions (note_id, revision_index);`
    ]
  }
]
