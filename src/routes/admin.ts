import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Config } from "../config";
import { PostRepository, parseTags } from "../lib/posts";
import { requireAdmin } from "../lib/auth";
import { slugify } from "../lib/slug";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function adminRoutes(repo: PostRepository, config: Config): Router {
  const router = Router();

  // Store uploads in the configured images directory with a safe, unique name.
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.imagesDir, { recursive: true });
      cb(null, config.imagesDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = slugify(path.basename(file.originalname, ext)) || "image";
      const stamp = Date.now().toString(36);
      cb(null, `${base}-${stamp}${ext}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, /^image\//.test(file.mimetype));
    },
  });

  // Guard only the /admin paths; other routers handle public requests.
  router.use("/admin", requireAdmin(config.adminEmail, config.disableAuth));

  // Dashboard: list posts (including drafts) with edit/publish/delete actions.
  router.get("/admin", (_req, res) => {
    res.render("admin/dashboard", {
      posts: repo.list({ includeDrafts: true }),
      pageTitle: "Dashboard",
    });
  });

  // New post form.
  router.get("/admin/posts/new", (_req, res) => {
    res.render("admin/edit", {
      post: { title: "", description: "", publishedAt: todayIso(), tags: [] },
      action: "/admin/posts",
      pageTitle: "New post",
      isNew: true,
    });
  });

  // Create a post.
  router.post("/admin/posts", (req, res) => {
    const { title, description, publishedAt, tags } = req.body;
    const post = repo.create({
      title: (title || "").trim(),
      description: description || "",
      publishedAt: publishedAt || todayIso(),
      tags: parseTags(tags || ""),
    });
    res.redirect(`/posts/${post.slug}`);
  });

  // Edit post form.
  router.get("/admin/posts/:id/edit", (req, res) => {
    const post = repo.getById(Number(req.params.id));
    if (!post) {
      res.status(404).render("404", { pageTitle: "Not found" });
      return;
    }
    res.render("admin/edit", {
      post,
      action: `/admin/posts/${post.id}`,
      pageTitle: `Edit: ${post.title}`,
      isNew: false,
    });
  });

  // Update a post (slug/permalink stays fixed).
  router.post("/admin/posts/:id", (req, res) => {
    const { title, description, publishedAt, tags } = req.body;
    const post = repo.update(Number(req.params.id), {
      title: (title || "").trim(),
      description: description || "",
      publishedAt: publishedAt || todayIso(),
      tags: parseTags(tags || ""),
    });
    if (!post) {
      res.status(404).render("404", { pageTitle: "Not found" });
      return;
    }
    res.redirect(`/posts/${post.slug}`);
  });

  // Publish a draft.
  router.post("/admin/posts/:id/publish", (req, res) => {
    repo.setStatus(Number(req.params.id), "published");
    res.redirect("/admin");
  });

  // Retract a published post back to draft.
  router.post("/admin/posts/:id/retract", (req, res) => {
    repo.setStatus(Number(req.params.id), "draft");
    res.redirect("/admin");
  });

  // Delete a post.
  router.post("/admin/posts/:id/delete", (req, res) => {
    repo.delete(Number(req.params.id));
    res.redirect("/admin");
  });

  // Upload an image; returns JSON with the public URL for use in Markdown.
  router.post("/admin/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No image uploaded" });
      return;
    }
    res.json({ url: `/images/${req.file.filename}` });
  });

  return router;
}
