import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";

/**
 * The single source of truth for "who may edit the blog".
 * Only the configured admin e-mail is authorized; everyone else is rejected,
 * regardless of being able to sign in with Google.
 */
export function isAuthorized(email: string | undefined, adminEmail: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
}

/** Augment the session type with our user field. */
declare module "express-session" {
  interface SessionData {
    user?: { email: string; name?: string; picture?: string };
  }
}

export interface GoogleAuth {
  /** URL the browser is redirected to in order to start the Google login. */
  authUrl(): string;
  /** Exchanges the OAuth `code` for the verified user profile. */
  verifyCode(code: string): Promise<{ email: string; name?: string; picture?: string }>;
}

export function createGoogleAuth(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): GoogleAuth {
  const client = new OAuth2Client(opts.clientId, opts.clientSecret, opts.redirectUri);
  return {
    authUrl() {
      return client.generateAuthUrl({
        access_type: "online",
        scope: ["openid", "email", "profile"],
        prompt: "select_account",
      });
    },
    async verifyCode(code: string) {
      const { tokens } = await client.getToken(code);
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: opts.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error("Google did not return an e-mail address");
      }
      return {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    },
  };
}

/**
 * Express middleware factory: guards admin routes.
 * When `disableAuth` is true the guard is a no-op (everyone is let through) —
 * useful for local development without configuring Google OAuth.
 */
export function requireAdmin(adminEmail: string, disableAuth = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (disableAuth || isAuthorized(req.session.user?.email, adminEmail)) {
      next();
      return;
    }
    res.redirect("/login");
  };
}
