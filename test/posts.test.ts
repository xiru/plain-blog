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

  // Posts are created as drafts; most listing tests want visible (published) posts.
  function publish(input: Parameters<PostRepository["create"]>[0]) {
    const p = repo.create(input);
    return repo.setStatus(p.id, "published")!;
  }

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
    publish({ title: "Old", description: "", publishedAt: "2020-01-01", tags: [] });
    publish({ title: "New", description: "", publishedAt: "2026-01-01", tags: [] });
    expect(repo.list().map((p) => p.title)).toEqual(["New", "Old"]);
  });

  it("filters by tag", () => {
    publish({ title: "A", description: "", publishedAt: "2026-01-02", tags: ["ts"] });
    publish({ title: "B", description: "", publishedAt: "2026-01-01", tags: ["web"] });
    publish({ title: "C", description: "", publishedAt: "2026-01-03", tags: ["ts", "web"] });
    expect(repo.listByTag("ts").map((p) => p.title)).toEqual(["C", "A"]);
    expect(repo.listByTag("web").map((p) => p.title)).toEqual(["C", "B"]);
  });

  it("reports tag counts and ignores orphan tags", () => {
    publish({ title: "A", description: "", publishedAt: "2026-01-01", tags: ["ts", "web"] });
    publish({ title: "B", description: "", publishedAt: "2026-01-02", tags: ["ts"] });
    expect(repo.allTags()).toEqual([
      { name: "ts", count: 2 },
      { name: "web", count: 1 },
    ]);
  });

  it("creates posts as draft by default", () => {
    const post = repo.create({ title: "Fresh", description: "", publishedAt: "2026-01-01", tags: [] });
    expect(post.status).toBe("draft");
  });

  it("publishes and retracts via setStatus", () => {
    const post = repo.create({ title: "Toggle", description: "", publishedAt: "2026-01-01", tags: [] });
    expect(repo.setStatus(post.id, "published")?.status).toBe("published");
    expect(repo.setStatus(post.id, "draft")?.status).toBe("draft");
    expect(repo.setStatus(9999, "published")).toBeNull();
  });

  it("preserves status when the post is edited", () => {
    const post = repo.create({ title: "Keep", description: "", publishedAt: "2026-01-01", tags: [] });
    repo.setStatus(post.id, "published");
    const updated = repo.update(post.id, {
      title: "Keep edited",
      description: "new",
      publishedAt: "2026-02-02",
      tags: [],
    });
    expect(updated?.status).toBe("published");
  });

  it("hides drafts from list/listByTag/allTags unless includeDrafts", () => {
    const draft = repo.create({ title: "Hidden", description: "", publishedAt: "2026-01-02", tags: ["secret"] });
    publish({ title: "Shown", description: "", publishedAt: "2026-01-01", tags: ["public"] });

    // Default: published only
    expect(repo.list().map((p) => p.title)).toEqual(["Shown"]);
    expect(repo.listByTag("secret")).toEqual([]);
    expect(repo.allTags()).toEqual([{ name: "public", count: 1 }]);

    // With includeDrafts: everything
    expect(repo.list({ includeDrafts: true }).map((p) => p.title)).toEqual(["Hidden", "Shown"]);
    expect(repo.listByTag("secret", { includeDrafts: true }).map((p) => p.id)).toEqual([draft.id]);
    expect(repo.allTags({ includeDrafts: true })).toEqual([
      { name: "public", count: 1 },
      { name: "secret", count: 1 },
    ]);
  });

  it("deletes a post and its tag links", () => {
    const post = publish({ title: "Bye", description: "", publishedAt: "2026-01-01", tags: ["x"] });
    expect(repo.allTags()).toEqual([{ name: "x", count: 1 }]);
    expect(repo.delete(post.id)).toBe(true);
    expect(repo.getById(post.id)).toBeNull();
    expect(repo.allTags()).toEqual([]);
    expect(repo.delete(post.id)).toBe(false);
  });
});
