/**
 * Ordered SQL migrations. Each runs once, inside a transaction, and is recorded in
 * `schema_migrations`. Never edit an applied migration: append a new one.
 */
export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    // Adopts the schema created by the previous version of the site (no-op on existing databases).
    name: '0000_adopt_legacy_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'normal' CHECK(role IN ('normal', 'admin')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subject_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_code TEXT NOT NULL COLLATE NOCASE,
        materia_slug TEXT NOT NULL,
        granted_by INTEGER NOT NULL REFERENCES users(id),
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_user_id, granted_user_id, subject_code)
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_permissions_granted ON subject_permissions(granted_user_id);
      CREATE INDEX IF NOT EXISTS idx_permissions_owner ON subject_permissions(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_permissions_code ON subject_permissions(subject_code);
      CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
      CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
    `,
  },
  {
    // Rendering moved to the browser; the server-side render cache is gone.
    name: '0001_drop_compiled_mdx_cache',
    sql: 'DROP TABLE IF EXISTS compiled_mdx_cache;',
  },
];
