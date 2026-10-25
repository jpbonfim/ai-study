import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: Database.Database;
  close(): void;
}

export function openDatabase(filePath: string, migrations: Migration[] = MIGRATIONS): DatabaseHandle {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite, migrations);
  return { db: drizzle(sqlite, { schema }), sqlite, close: () => sqlite.close() };
}

export function runMigrations(sqlite: Database.Database, migrations: Migration[]): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const record = sqlite.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      record.run(migration.name);
    })();
  }
}
