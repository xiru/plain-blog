import { describe, it, expect } from "vitest";
import { buildRssFeed, postUrl } from "../src/lib/rss";
import { Post } from "../src/lib/posts";

function post(over: Partial<Post>): Post {
  return {
    id: 1,
    slug: "hello",
    title: "Hello",
    description: "Body **md**",
    publishedAt: "2026-01-01",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    tags: [],
    ...over,
  };
}

describe("postUrl", () => {
  it("builds a permalink and trims trailing slashes", () => {
    expect(postUrl("https://x.com/", "my-post")).toBe("https://x.com/posts/my-post");
  });
});

describe("buildRssFeed", () => {
  const opts = { siteUrl: "https://x.com", title: "Blog", description: "desc" };

  it("produces valid RSS with channel metadata", () => {
    const xml = buildRssFeed([], opts);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<title>Blog</title>");
    expect(xml).toContain("<link>https://x.com</link>");
  });

  it("renders one item per post with permalink guid", () => {
    const xml = buildRssFeed(
      [post({ slug: "a", title: "Post A", tags: ["ts"] })],
      opts
    );
    expect(xml).toContain("<title>Post A</title>");
    expect(xml).toContain('<guid isPermaLink="true">https://x.com/posts/a</guid>');
    expect(xml).toContain("<category>ts</category>");
  });

  it("escapes XML-special characters in titles", () => {
    const xml = buildRssFeed([post({ title: "A & B <c>" })], opts);
    expect(xml).toContain("A &amp; B &lt;c&gt;");
  });

  it("formats pubDate as RFC-822", () => {
    const xml = buildRssFeed([post({ publishedAt: "2026-01-01" })], opts);
    expect(xml).toMatch(/<pubDate>.*2026.*<\/pubDate>/);
  });
});
