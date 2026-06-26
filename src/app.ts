import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import fs from "fs";
import { Config, activeSocialLinks } from "./config";
import { DB } from "./db";
import { PostRepository } from "./lib/posts";
import { GoogleAuth, createGoogleAuth, isAuthorized } from "./lib/auth";
import { publicRoutes } from "./routes/public";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";

export interface AppDeps {
  /** Override the Google auth implementation (tests inject a fake). */
  googleAuth?: GoogleAuth;
}

/**
 * Content-Security-Policy. Scripts and the bulk of resources are restricted to
 * the site's own origin; only Google Fonts is allowed as an external source.
 * `style-src 'unsafe-inline'` is required for the hero's inline background-image
 * and is low risk (no inline scripts are allowed).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self'",
].join("; ");

/** Builds the Express app. Pure wiring — no listening, so it's easy to test. */
export function createApp(db: DB, config: Config, deps: AppDeps = {}): Express {
  const app = express();
  const repo = new PostRepository(db);
  const isHttps = config.siteUrl.startsWith("https://");

  // Don't advertise the framework, and trust the proxy when behind TLS.
  app.disable("x-powered-by");
  if (isHttps) app.set("trust proxy", 1);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  // Security headers applied to every response (including static files).
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (isHttps) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains"
      );
    }
    next();
  });

  // Cap request bodies to bound memory use / abuse.
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      name: "sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps, // require HTTPS for the cookie in production
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  // Make site-wide values available to every template.
  app.use((req, res, next) => {
    res.locals.site = {
      title: config.siteTitle,
      description: config.siteDescription,
      author: config.author,
      url: config.siteUrl,
    };
    res.locals.social = activeSocialLinks(config.social);
    res.locals.branding = config.branding;
    res.locals.currentUser = req.session.user || null;
    res.locals.isAdmin =
      config.disableAuth || isAuthorized(req.session.user?.email, config.adminEmail);
    // When auth is disabled there is no real session, so login/logout are
    // meaningless — templates use this to hide those links.
    res.locals.authEnabled = !config.disableAuth;
    res.locals.pageTitle = null;
    next();
  });

  // Serve uploaded images from the images directory at /images.
  fs.mkdirSync(config.imagesDir, { recursive: true });
  app.use("/images", express.static(config.imagesDir));
  // Static assets (CSS).
  app.use("/assets", express.static(path.join(__dirname, "..", "public")));

  const googleAuth =
    deps.googleAuth ||
    createGoogleAuth({
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      redirectUri: `${config.siteUrl}/auth/google/callback`,
    });

  app.use(authRoutes(googleAuth, config));
  app.use(adminRoutes(repo, config));
  app.use(publicRoutes(repo, config));

  // 404 fallback.
  app.use((_req, res) => {
    res.status(404).render("404", { pageTitle: "Not found" });
  });

  // Central error handler. Logs server-side and returns a self-contained page.
  // It deliberately does NOT use res.render / res.locals: errors can occur before
  // those locals are populated (e.g. a body-parser failure), and an error handler
  // must never throw — otherwise Express's default handler leaks the stack trace.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    if (res.headersSent) return;
    const status = (err as { status?: number }).status || 500;
    res
      .status(status)
      .type("html")
      .send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
          `<title>Error</title></head><body style="font-family:sans-serif;` +
          `max-width:640px;margin:4rem auto;padding:0 1rem">` +
          `<h1>${status} — Something went wrong</h1>` +
          `<p>An unexpected error occurred. <a href="/">Back home</a>.</p>` +
          `</body></html>`
      );
  });

  return app;
}
