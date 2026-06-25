import { Router } from "express";
import { Config } from "../config";
import { GoogleAuth, isAuthorized } from "../lib/auth";

export function authRoutes(auth: GoogleAuth, config: Config): Router {
  const router = Router();

  router.get("/login", (req, res) => {
    if (isAuthorized(req.session.user?.email, config.adminEmail)) {
      res.redirect("/admin");
      return;
    }
    res.render("login", { pageTitle: "Sign in", error: req.query.error });
  });

  // Kick off the Google OAuth flow.
  router.get("/auth/google", (_req, res) => {
    res.redirect(auth.authUrl());
  });

  // Google redirects back here with a `code`.
  router.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.redirect("/login?error=missing_code");
      return;
    }
    try {
      const profile = await auth.verifyCode(code);
      if (!isAuthorized(profile.email, config.adminEmail)) {
        res.redirect("/login?error=unauthorized");
        return;
      }
      req.session.user = profile;
      res.redirect("/admin");
    } catch (err) {
      res.redirect("/login?error=auth_failed");
    }
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
  });

  return router;
}
