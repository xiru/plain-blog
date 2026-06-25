import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb, DB } from "../src/db";
import { loadConfig, Config } from "../src/config";
import { createApp } from "../src/app";
import { PostRepository } from "../src/lib/posts";
import { GoogleAuth } from "../src/lib/auth";
import os from "os";
import path from "path";
import fs from "fs";

const ADMIN = "fabiano.weimar@gmail.com";
const TMP_IMAGES = fs.mkdtempSync(path.join(os.tmpdir(), "plain-blog-test-"));

function makeApp(email: string, opts: { throwOnVerify?: boolean } = {}) {
  const db: DB = openDb(":memory:");
  const config: Config = loadConfig({
    ADMIN_EMAIL: ADMIN,
    SITE_URL: "http://x.test",
    IMAGES_DIR: TMP_IMAGES,
  });
  const fakeAuth: GoogleAuth = {
    authUrl: () => "https://accounts.google.com/o/oauth2/auth?fake=1",
    verifyCode: async () => {
      if (opts.throwOnVerify) throw new Error("boom");
      return { email, name: "Tester" };
    },
  };
  const app = createApp(db, config, { googleAuth: fakeAuth });
  return { app, repo: new PostRepository(db) };
}

/** Logs in through the (faked) Google callback and returns an authed agent. */
async function login(app: ReturnType<typeof makeApp>["app"]) {
  const agent = request.agent(app);
  await agent.get("/auth/google/callback?code=fake");
  return agent;
}

describe("public routes", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let repo: PostRepository;

  beforeEach(() => {
    const made = makeApp(ADMIN);
    app = made.app;
    repo = made.repo;
  });

  it("renders the home page", async () => {
    repo.create({ title: "First Post", description: "Hi", publishedAt: "2026-01-01", tags: ["ts"] });
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("First Post");
  });

  it("serves a post permalink", async () => {
    const p = repo.create({ title: "Perma", description: "**body**", publishedAt: "2026-01-01", tags: [] });
    const res = await request(app).get(`/posts/${p.slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("<strong>body</strong>");
  });

  it("404s an unknown post", async () => {
    const res = await request(app).get("/posts/nope");
    expect(res.status).toBe(404);
  });

  it("lists posts by tag", async () => {
    repo.create({ title: "Tagged", description: "x", publishedAt: "2026-01-01", tags: ["web"] });
    const res = await request(app).get("/tags/web");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Tagged");
  });

  it("serves an RSS feed", async () => {
    repo.create({ title: "Feed Item", description: "x", publishedAt: "2026-01-01", tags: [] });
    const res = await request(app).get("/rss.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("rss+xml");
    expect(res.text).toContain("Feed Item");
  });
});

describe("auth guard", () => {
  it("redirects anonymous users away from /admin", async () => {
    const { app } = makeApp(ADMIN);
    const res = await request(app).get("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("rejects a non-admin Google account", async () => {
    const { app } = makeApp("intruder@gmail.com");
    const res = await request(app).get("/auth/google/callback?code=fake");
    expect(res.headers.location).toBe("/login?error=unauthorized");
    // and still cannot reach admin
    const res2 = await request(app).get("/admin");
    expect(res2.headers.location).toBe("/login");
  });
});

describe("auth routes", () => {
  it("renders the login page for anonymous users", async () => {
    const { app } = makeApp(ADMIN);
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Continue with Google");
  });

  it("shows an unauthorized message via the error query", async () => {
    const { app } = makeApp(ADMIN);
    const res = await request(app).get("/login?error=unauthorized");
    expect(res.text).toContain("not authorized");
  });

  it("redirects an authed user away from /login", async () => {
    const { app } = makeApp(ADMIN);
    const agent = await login(app);
    const res = await agent.get("/login");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin");
  });

  it("starts the Google flow", async () => {
    const { app } = makeApp(ADMIN);
    const res = await request(app).get("/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
  });

  it("handles a callback with no code", async () => {
    const { app } = makeApp(ADMIN);
    const res = await request(app).get("/auth/google/callback");
    expect(res.headers.location).toBe("/login?error=missing_code");
  });

  it("handles a failing token exchange", async () => {
    const { app } = makeApp(ADMIN, { throwOnVerify: true });
    const res = await request(app).get("/auth/google/callback?code=x");
    expect(res.headers.location).toBe("/login?error=auth_failed");
  });

  it("logs out and clears the session", async () => {
    const { app } = makeApp(ADMIN);
    const agent = await login(app);
    const out = await agent.post("/logout");
    expect(out.headers.location).toBe("/");
    // session gone -> admin now blocked
    const res = await agent.get("/admin");
    expect(res.headers.location).toBe("/login");
  });
});

describe("admin routes (authenticated)", () => {
  it("renders the new and edit forms, 404s a missing edit", async () => {
    const { app, repo } = makeApp(ADMIN);
    const agent = await login(app);

    const newForm = await agent.get("/admin/posts/new");
    expect(newForm.status).toBe(200);
    expect(newForm.text).toContain("New post");

    const p = repo.create({ title: "Editable", description: "x", publishedAt: "2026-01-01", tags: [] });
    const editForm = await agent.get(`/admin/posts/${p.id}/edit`);
    expect(editForm.status).toBe(200);
    expect(editForm.text).toContain("Editable");

    const missing = await agent.get("/admin/posts/9999/edit");
    expect(missing.status).toBe(404);

    const missingUpdate = await agent
      .post("/admin/posts/9999")
      .type("form")
      .send({ title: "x", description: "y", publishedAt: "2026-01-01", tags: "" });
    expect(missingUpdate.status).toBe(404);
  });

  it("uploads an image and returns its public url", async () => {
    const { app } = makeApp(ADMIN);
    const agent = await login(app);
    const res = await agent
      .post("/admin/upload")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "My Photo.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/my-photo-[a-z0-9]+\.png$/);
  });

  it("rejects an upload with no file", async () => {
    const { app } = makeApp(ADMIN);
    const agent = await login(app);
    const res = await agent.post("/admin/upload");
    expect(res.status).toBe(400);
  });


  it("creates, edits and deletes a post", async () => {
    const { app, repo } = makeApp(ADMIN);
    const agent = await login(app);

    // reaches the dashboard
    const dash = await agent.get("/admin");
    expect(dash.status).toBe(200);

    // create
    const create = await agent
      .post("/admin/posts")
      .type("form")
      .send({ title: "Made via HTTP", description: "Body", publishedAt: "2026-01-01", tags: "ts, web" });
    expect(create.status).toBe(302);
    expect(create.headers.location).toBe("/posts/made-via-http");

    const post = repo.getBySlug("made-via-http")!;
    expect(post.tags).toEqual(["ts", "web"]);

    // edit keeps the slug
    const edit = await agent
      .post(`/admin/posts/${post.id}`)
      .type("form")
      .send({ title: "Renamed", description: "New", publishedAt: "2026-02-02", tags: "career" });
    expect(edit.headers.location).toBe("/posts/made-via-http");
    expect(repo.getById(post.id)!.tags).toEqual(["career"]);

    // delete
    const del = await agent.post(`/admin/posts/${post.id}/delete`);
    expect(del.headers.location).toBe("/admin");
    expect(repo.getById(post.id)).toBeNull();
  });
});
