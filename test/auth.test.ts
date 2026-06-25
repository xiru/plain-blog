import { describe, it, expect } from "vitest";
import { isAuthorized } from "../src/lib/auth";
import { loadConfig, activeSocialLinks } from "../src/config";

describe("isAuthorized", () => {
  const admin = "fabiano.weimar@gmail.com";
  it("accepts the admin email (case-insensitive)", () => {
    expect(isAuthorized("fabiano.weimar@gmail.com", admin)).toBe(true);
    expect(isAuthorized("Fabiano.Weimar@Gmail.com", admin)).toBe(true);
  });
  it("rejects anyone else", () => {
    expect(isAuthorized("someone@gmail.com", admin)).toBe(false);
    expect(isAuthorized(undefined, admin)).toBe(false);
    expect(isAuthorized("", admin)).toBe(false);
  });
});

describe("config", () => {
  it("applies defaults", () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.adminEmail).toBe("fabiano.weimar@gmail.com");
    expect(c.siteUrl).toBe("http://localhost:3000");
  });

  it("disables auth by default and honors DISABLE_AUTH override", () => {
    expect(loadConfig({}).disableAuth).toBe(true);
    expect(loadConfig({ DISABLE_AUTH: "false" }).disableAuth).toBe(false);
    expect(loadConfig({ DISABLE_AUTH: "0" }).disableAuth).toBe(false);
    expect(loadConfig({ DISABLE_AUTH: "true" }).disableAuth).toBe(true);
  });

  it("reads env and strips trailing slash from siteUrl", () => {
    const c = loadConfig({ PORT: "8080", SITE_URL: "https://blog.example.com/" });
    expect(c.port).toBe(8080);
    expect(c.siteUrl).toBe("https://blog.example.com");
  });

  it("provides default branding images and honors overrides", () => {
    expect(loadConfig({}).branding).toEqual({
      avatar: "/assets/img/avatar.svg",
      headerImage: "/assets/img/header-bg.svg",
      favicon: "/assets/img/favicon.svg",
      ogImage: "/assets/img/og-image.svg",
    });
    expect(loadConfig({ IMG_AVATAR: "/custom/me.jpg" }).branding.avatar).toBe("/custom/me.jpg");
  });

  it("only returns configured social links, in order", () => {
    const links = activeSocialLinks({
      github: "https://github.com/x",
      instagram: "https://instagram.com/x",
    });
    expect(links).toEqual([
      { name: "github", url: "https://github.com/x" },
      { name: "instagram", url: "https://instagram.com/x" },
    ]);
  });
});
