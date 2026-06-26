import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type DB = Database.Database;

/**
 * Opens (or creates) the SQLite database and applies the schema.
 * Pass ":memory:" for an ephemeral database (used by tests).
 */
export function openDb(dbPath: string): DB {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);
  `);

  // Add the status column to databases created before it existed.
  const columns = db.prepare(`PRAGMA table_info(posts)`).all() as { name: string }[];
  if (!columns.some((c) => c.name === "status")) {
    db.exec(`ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);`);
}
