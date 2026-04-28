import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = resolve(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const isApplied = db.prepare(
    'SELECT 1 FROM schema_migrations WHERE filename = ?',
  );
  const recordApplied = db.prepare(
    'INSERT INTO schema_migrations (filename) VALUES (?)',
  );

  for (const file of files) {
    if (isApplied.get(file)) {
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      recordApplied.run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
