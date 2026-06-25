import { DB } from "../db";
import { uniqueSlug } from "./slug";

export interface Post {
  id: number;
  slug: string;
  title: string;
  /** Raw Markdown body. */
  description: string;
  /** ISO date string (YYYY-MM-DD or full ISO). */
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface PostInput {
  title: string;
  description: string;
  publishedAt: string;
  tags: string[];
}

interface PostRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

/** Normalizes a free-text tag list into trimmed, de-duplicated, lower-cased tags. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Parses a comma-separated tag string ("ts, web , web") into normalized tags. */
export function parseTags(input: string): string[] {
  return normalizeTags((input || "").split(","));
}

export class PostRepository {
  constructor(private db: DB) {}

  private nowIso(): string {
    return new Date().toISOString();
  }

  private tagsFor(postId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.name FROM tags t
         JOIN post_tags pt ON pt.tag_id = t.id
         WHERE pt.post_id = ? ORDER BY t.name`
      )
      .all(postId) as { name: string }[];
    return rows.map((r) => r.name);
  }

  private hydrate(row: PostRow): Post {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: this.tagsFor(row.id),
    };
  }

  private syncTags(postId: number, tags: string[]): void {
    this.db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(postId);
    const insertTag = this.db.prepare(
      `INSERT OR IGNORE INTO tags (name) VALUES (?)`
    );
    const findTag = this.db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const link = this.db.prepare(
      `INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`
    );
    for (const name of normalizeTags(tags)) {
      insertTag.run(name);
      const tag = findTag.get(name) as { id: number };
      link.run(postId, tag.id);
    }
  }

  slugExists(slug: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM posts WHERE slug = ?`).get(slug);
  }

  create(input: PostInput): Post {
    const now = this.nowIso();
    const slug = uniqueSlug(input.title, (s) => this.slugExists(s));
    const info = this.db
      .prepare(
        `INSERT INTO posts (slug, title, description, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(slug, input.title, input.description, input.publishedAt, now, now);
    const id = Number(info.lastInsertRowid);
    this.syncTags(id, input.tags);
    return this.getById(id)!;
  }

  /**
   * Updates an existing post. The slug (permalink) is intentionally NOT changed,
   * so URLs stay fixed and immutable even when the title is edited.
   */
  update(id: number, input: PostInput): Post | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE posts SET title = ?, description = ?, published_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(input.title, input.description, input.publishedAt, this.nowIso(), id);
    this.syncTags(id, input.tags);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const info = this.db.prepare(`DELETE FROM posts WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  getById(id: number): Post | null {
    const row = this.db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as
      | PostRow
      | undefined;
    return row ? this.hydrate(row) : null;
  }

  getBySlug(slug: string): Post | null {
    const row = this.db
      .prepare(`SELECT * FROM posts WHERE slug = ?`)
      .get(slug) as PostRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  /** All posts, newest first. */
  list(): Post[] {
    const rows = this.db
      .prepare(`SELECT * FROM posts ORDER BY published_at DESC, id DESC`)
      .all() as PostRow[];
    return rows.map((r) => this.hydrate(r));
  }

  /** Posts carrying a given tag, newest first. */
  listByTag(tag: string): Post[] {
    const rows = this.db
      .prepare(
        `SELECT p.* FROM posts p
         JOIN post_tags pt ON pt.post_id = p.id
         JOIN tags t ON t.id = pt.tag_id
         WHERE t.name = ?
         ORDER BY p.published_at DESC, p.id DESC`
      )
      .all(tag.trim().toLowerCase()) as PostRow[];
    return rows.map((r) => this.hydrate(r));
  }

  /** Every tag with its post count, alphabetically. */
  allTags(): { name: string; count: number }[] {
    return this.db
      .prepare(
        `SELECT t.name AS name, COUNT(pt.post_id) AS count
         FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
         GROUP BY t.id HAVING count > 0 ORDER BY t.name`
      )
      .all() as { name: string; count: number }[];
  }
}
