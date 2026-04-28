import BetterSqlite3, { type Database } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrate.js';
import { seedIfEmpty } from './seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type DB = Database;

export function defaultDbPath(): string {
  return resolve(__dirname, '../../data/library.db');
}

export interface OpenDbOptions {
  filename?: string;
  seed?: boolean;
}

export function openDatabase(options: OpenDbOptions = {}): DB {
  const filename = options.filename ?? defaultDbPath();
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const db = new BetterSqlite3(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  if (options.seed !== false) {
    seedIfEmpty(db);
  }
  return db;
}
