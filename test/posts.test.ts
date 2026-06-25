import { describe, it, expect, beforeEach } from "vitest";
import { openDb, DB } from "../src/db";
import { PostRepository, normalizeTags, parseTags } from "../src/lib/posts";

describe("tag helpers", () => {
  it("normalizes, lowercases and dedupes", () => {
    expect(normalizeTags([" TS ", "ts", "Web", ""])).toEqual(["ts", "web"]);
  });
  it("parses a comma-separated string", () => {
    expect(parseTags("ts, web , web,, Career")).toEqual(["ts", "web", "career"]);
  });
});

describe("PostRepository", () => {
  let db: DB;
  let repo: PostRepository;

  beforeEach(() => {
    db = openDb(":memory:");
    repo = new PostRepository(db);
  });

  it("creates a post with a slug and tags", () => {
    const post = repo.create({
      title: "Hello World",
      description: "Body",
      publishedAt: "2026-01-01",
      tags: ["ts", "web"],
    });
    expect(post.slug).toBe("hello-world");
    expect(post.tags).toEqual(["ts", "web"]);
    expect(post.id).toBeGreaterThan(0);
  });

  it("generates unique slugs for duplicate titles", () => {
    const a = repo.create({ title: "Same", description: "", publishedAt: "2026-01-01", tags: [] });
    const b = repo.create({ title: "Same", description: "", publishedAt: "2026-01-02", tags: [] });
    expect(a.slug).toBe("same");
    expect(b.slug).toBe("same-2");
  });

  it("fetches by slug and by id", () => {
    const post = repo.create({ title: "Find Me", description: "x", publishedAt: "2026-01-01", tags: [] });
    expect(repo.getBySlug("find-me")?.id).toBe(post.id);
    expect(repo.getById(post.id)?.slug).toBe("find-me");
    expect(repo.getBySlug("missing")).toBeNull();
  });

  it("keeps the slug immutable when updating the title", () => {
    const post = repo.create({ title: "Original", description: "x", publishedAt: "2026-01-01", tags: ["a"] });
    const updated = repo.update(post.id, {
      title: "Renamed Completely",
      description: "y",
      publishedAt: "2026-02-02",
      tags: ["b", "c"],
    });
    expect(updated?.slug).toBe("original");
    expect(updated?.title).toBe("Renamed Completely");
    expect(updated?.tags).toEqual(["b", "c"]);
  });

  it("returns null when updating a missing post", () => {
    expect(repo.update(999, { title: "x", description: "", publishedAt: "2026-01-01", tags: [] })).toBeNull();
  });

  it("lists posts newest first", () => {
    repo.create({ title: "Old", description: "", publishedAt: "2020-01-01", tags: [] });
    repo.create({ title: "New", description: "", publishedAt: "2026-01-01", tags: [] });
    expect(repo.list().map((p) => p.title)).toEqual(["New", "Old"]);
  });

  it("filters by tag", () => {
    repo.create({ title: "A", description: "", publishedAt: "2026-01-02", tags: ["ts"] });
    repo.create({ title: "B", description: "", publishedAt: "2026-01-01", tags: ["web"] });
    repo.create({ title: "C", description: "", publishedAt: "2026-01-03", tags: ["ts", "web"] });
    expect(repo.listByTag("ts").map((p) => p.title)).toEqual(["C", "A"]);
    expect(repo.listByTag("web").map((p) => p.title)).toEqual(["C", "B"]);
  });

  it("reports tag counts and ignores orphan tags", () => {
    repo.create({ title: "A", description: "", publishedAt: "2026-01-01", tags: ["ts", "web"] });
    repo.create({ title: "B", description: "", publishedAt: "2026-01-02", tags: ["ts"] });
    expect(repo.allTags()).toEqual([
      { name: "ts", count: 2 },
      { name: "web", count: 1 },
    ]);
  });

  it("deletes a post and its tag links", () => {
    const post = repo.create({ title: "Bye", description: "", publishedAt: "2026-01-01", tags: ["x"] });
    expect(repo.delete(post.id)).toBe(true);
    expect(repo.getById(post.id)).toBeNull();
    expect(repo.allTags()).toEqual([]);
    expect(repo.delete(post.id)).toBe(false);
  });
});
