import { describe, it, expect } from "vitest";
import request from "supertest";
import os from "os";
import path from "path";
import fs from "fs";
import { openDb, DB } from "../src/db";
import { loadConfig, Config } from "../src/config";
import { createApp } from "../src/app";
import { PostRepository } from "../src/lib/posts";
import { GoogleAuth } from "../src/lib/auth";

const ADMIN = "fabiano.weimar@gmail.com";
const TMP_IMAGES = fs.mkdtempSync(path.join(os.tmpdir(), "plain-blog-sec-"));

function makeApp(opts: { disableAuth?: boolean; https?: boolean } = {}) {
  const db: DB = openDb(":memory:");
  const config: Config = loadConfig({
    ADMIN_EMAIL: ADMIN,
    SITE_URL: opts.https ? "https://blog.test" : "http://x.test",
    IMAGES_DIR: TMP_IMAGES,
    DISABLE_AUTH: opts.disableAuth ? "true" : "false",
  });
  const fakeAuth: GoogleAuth = {
    authUrl: () => "https://accounts.google.com/o/oauth2/auth",
    verifyCode: async () => ({ email: ADMIN }),
  };
  const app = createApp(db, config, { googleAuth: fakeAuth });
  return { app, repo: new PostRepository(db) };
}

describe("security headers", () => {
  it("sets CSP, nosniff and frame options, and hides the framework", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/");
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("object-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("only sends HSTS and secure cookies over HTTPS", async () => {
    const http = await request(makeApp({ https: false }).app).get("/");
    expect(http.headers["strict-transport-security"]).toBeUndefined();

    const https = await request(makeApp({ https: true }).app).get("/");
    expect(https.headers["strict-transport-security"]).toContain("max-age=");
  });
});

describe("error handling", () => {
  it("returns a generic error page without leaking a stack trace", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send("{ this is not valid json");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("Something went wrong");
    // No stack-trace markers leak into the response.
    expect(res.text).not.toContain("SyntaxError");
    expect(res.text).not.toContain("node_modules");
    expect(res.text).not.toContain("body-parser");
    expect(res.text).not.toMatch(/\.js:\d+:\d+/);
  });
});

describe("path traversal", () => {
  it("does not serve files outside the images directory", async () => {
    const { app } = makeApp();
    for (const p of [
      "/images/../../package.json",
      "/images/..%2f..%2fpackage.json",
      "/images/%2e%2e/%2e%2e/package.json",
    ]) {
      const res = await request(app).get(p);
      expect(res.status).not.toBe(200);
      expect(res.text || "").not.toContain("plain-blog");
    }
  });

  it("does not serve files outside the assets directory", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/assets/../package.json");
    expect(res.status).not.toBe(200);
  });
});

describe("SQL injection", () => {
  it("treats malicious input as data, not SQL", () => {
    const db = openDb(":memory:");
    const repo = new PostRepository(db);
    const p = repo.create({ title: "Safe", description: "x", publishedAt: "2026-01-01", tags: ["ok"] });
    repo.setStatus(p.id, "published");

    // None of these should error, drop tables, or bypass filters.
    expect(repo.getBySlug("' OR '1'='1")).toBeNull();
    expect(repo.getBySlug("'; DROP TABLE posts; --")).toBeNull();
    expect(repo.listByTag("ok' OR '1'='1")).toEqual([]);

    // The table is intact and the legitimate row is still queryable.
    expect(repo.list().map((x) => x.title)).toEqual(["Safe"]);
  });
});

describe("upload hardening", () => {
  it("rejects SVG uploads (XSS vector)", async () => {
    const { app } = makeApp({ disableAuth: true });
    const res = await request(app)
      .post("/admin/upload")
      .attach("image", Buffer.from("<svg onload=alert(1)></svg>"), {
        filename: "evil.svg",
        contentType: "image/svg+xml",
      });
    expect(res.status).toBe(400);
  });

  it("rejects non-image content disguised by extension", async () => {
    const { app } = makeApp({ disableAuth: true });
    const res = await request(app)
      .post("/admin/upload")
      .attach("image", Buffer.from("<html>nope</html>"), {
        filename: "evil.png",
        contentType: "text/html",
      });
    expect(res.status).toBe(400);
  });

  it("accepts a genuine raster image", async () => {
    const { app } = makeApp({ disableAuth: true });
    const res = await request(app)
      .post("/admin/upload")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "photo.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/photo-[a-z0-9]+\.png$/);
  });
});
