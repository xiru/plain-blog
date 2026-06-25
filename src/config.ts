import dotenv from "dotenv";
import path from "path";

dotenv.config();

export interface SocialLinks {
  twitter?: string;
  github?: string;
  linkedin?: string;
  slideshare?: string;
  flickr?: string;
  facebook?: string;
  instagram?: string;
}

export interface Config {
  port: number;
  /** Public base URL of the site, e.g. https://blog.example.com */
  siteUrl: string;
  siteTitle: string;
  siteDescription: string;
  author: string;
  /** Only this Google account may create/edit posts. */
  adminEmail: string;
  google: {
    clientId: string;
    clientSecret: string;
  };
  sessionSecret: string;
  dbPath: string;
  /** Absolute path to the directory where uploaded images are stored. */
  imagesDir: string;
  social: SocialLinks;
}

function bool(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = process.cwd();
  return {
    port: parseInt(env.PORT || "3000", 10),
    siteUrl: (env.SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    siteTitle: env.SITE_TITLE || "Fabiano Weimar",
    siteDescription:
      env.SITE_DESCRIPTION || "Notes on software engineering and assorted topics.",
    author: env.SITE_AUTHOR || "Fabiano Weimar",
    adminEmail: env.ADMIN_EMAIL || "fabiano.weimar@gmail.com",
    google: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    },
    sessionSecret: env.SESSION_SECRET || "change-me-in-production",
    dbPath: env.DB_PATH || path.join(root, "data", "blog.db"),
    imagesDir: env.IMAGES_DIR || path.join(root, "images"),
    social: {
      twitter: env.SOCIAL_TWITTER,
      github: env.SOCIAL_GITHUB,
      linkedin: env.SOCIAL_LINKEDIN,
      slideshare: env.SOCIAL_SLIDESHARE,
      flickr: env.SOCIAL_FLICKR,
      facebook: env.SOCIAL_FACEBOOK,
      instagram: env.SOCIAL_INSTAGRAM,
    },
  };
}

/** Returns only the social links that are configured, in display order. */
export function activeSocialLinks(social: SocialLinks): { name: string; url: string }[] {
  const order: (keyof SocialLinks)[] = [
    "github",
    "twitter",
    "linkedin",
    "slideshare",
    "flickr",
    "facebook",
    "instagram",
  ];
  return order
    .filter((k) => !!social[k])
    .map((k) => ({ name: k, url: social[k] as string }));
}

export { bool };
