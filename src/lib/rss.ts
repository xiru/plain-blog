import { Post } from "./posts";
import { renderPlainText } from "./markdown";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface FeedOptions {
  siteUrl: string;
  title: string;
  description: string;
}

/** Permalink for a post, given the site base URL. */
export function postUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/posts/${slug}`;
}

/**
 * Builds an RSS 2.0 feed containing all posts, newest first.
 * `posts` is expected to already be sorted by date descending.
 */
export function buildRssFeed(posts: Post[], opts: FeedOptions): string {
  const items = posts
    .map((p) => {
      const link = postUrl(opts.siteUrl, p.slug);
      const pubDate = new Date(p.publishedAt).toUTCString();
      const desc = renderPlainText(p.description, 500);
      const categories = p.tags
        .map((t) => `      <category>${escapeXml(t)}</category>`)
        .join("\n");
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(desc)}</description>
${categories}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(opts.title)}</title>
    <link>${escapeXml(opts.siteUrl)}</link>
    <description>${escapeXml(opts.description)}</description>
    <language>en</language>
${items}
  </channel>
</rss>`;
}
