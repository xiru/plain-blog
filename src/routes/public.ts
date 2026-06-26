import { Router } from "express";
import { Config } from "../config";
import { PostRepository } from "../lib/posts";
import { renderMarkdown, renderPlainText } from "../lib/markdown";
import { buildRssFeed } from "../lib/rss";

export function publicRoutes(repo: PostRepository, config: Config): Router {
  const router = Router();

  // Home: list of posts, newest first. Drafts are visible only to the owner.
  router.get("/", (_req, res) => {
    const includeDrafts = res.locals.isAdmin === true;
    const posts = repo.list({ includeDrafts }).map((p) => ({
      ...p,
      excerpt: renderPlainText(p.description, 240),
    }));
    res.render("index", { posts, tags: repo.allTags({ includeDrafts }), pageTitle: null });
  });

  // RSS feed — published posts only, ordered by date. Drafts never leak here.
  router.get("/rss.xml", (_req, res) => {
    const xml = buildRssFeed(repo.list(), {
      siteUrl: config.siteUrl,
      title: config.siteTitle,
      description: config.siteDescription,
    });
    res.type("application/rss+xml").send(xml);
  });

  // Posts filtered by tag.
  router.get("/tags/:tag", (req, res) => {
    const tag = req.params.tag.toLowerCase();
    const includeDrafts = res.locals.isAdmin === true;
    const posts = repo.listByTag(tag, { includeDrafts }).map((p) => ({
      ...p,
      excerpt: renderPlainText(p.description, 240),
    }));
    res.render("tag", {
      posts,
      tag,
      tags: repo.allTags({ includeDrafts }),
      pageTitle: `#${tag}`,
    });
  });

  // A single post — the immutable permalink. Drafts 404 for non-owners.
  router.get("/posts/:slug", (req, res) => {
    const post = repo.getBySlug(req.params.slug);
    if (!post || (post.status === "draft" && res.locals.isAdmin !== true)) {
      res.status(404).render("404", { pageTitle: "Not found" });
      return;
    }
    res.render("post", {
      post,
      bodyHtml: renderMarkdown(post.description),
      pageTitle: post.title,
    });
  });

  return router;
}
