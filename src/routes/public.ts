import { Router } from "express";
import { Config } from "../config";
import { PostRepository } from "../lib/posts";
import { renderMarkdown, renderPlainText } from "../lib/markdown";
import { buildRssFeed } from "../lib/rss";

export function publicRoutes(repo: PostRepository, config: Config): Router {
  const router = Router();

  // Home: list of all posts, newest first.
  router.get("/", (_req, res) => {
    const posts = repo.list().map((p) => ({
      ...p,
      excerpt: renderPlainText(p.description, 240),
    }));
    res.render("index", { posts, tags: repo.allTags(), pageTitle: null });
  });

  // RSS feed of every post, ordered by date.
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
    const posts = repo.listByTag(tag).map((p) => ({
      ...p,
      excerpt: renderPlainText(p.description, 240),
    }));
    res.render("tag", { posts, tag, tags: repo.allTags(), pageTitle: `#${tag}` });
  });

  // A single post — the immutable permalink.
  router.get("/posts/:slug", (req, res) => {
    const post = repo.getBySlug(req.params.slug);
    if (!post) {
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
