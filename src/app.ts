import express, { Express } from "express";
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

/** Builds the Express app. Pure wiring — no listening, so it's easy to test. */
export function createApp(db: DB, config: Config, deps: AppDeps = {}): Express {
  const app = express();
  const repo = new PostRepository(db);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
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
    res.locals.currentUser = req.session.user || null;
    res.locals.isAdmin = isAuthorized(req.session.user?.email, config.adminEmail);
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

  return app;
}
