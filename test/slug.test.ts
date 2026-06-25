import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "../src/lib/slug";

describe("slugify", () => {
  it("lowercases and dashes spaces", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips accents", () => {
    expect(slugify("Programação em Português")).toBe("programacao-em-portugues");
  });

  it("removes punctuation and collapses dashes", () => {
    expect(slugify("Hello,  World!! -- Again")).toBe("hello-world-again");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("  --hi--  ")).toBe("hi");
  });

  it("caps length at 80 chars", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("uniqueSlug", () => {
  it("returns base when free", () => {
    expect(uniqueSlug("My Post", () => false)).toBe("my-post");
  });

  it("appends a counter when taken", () => {
    const taken = new Set(["my-post", "my-post-2"]);
    expect(uniqueSlug("My Post", (s) => taken.has(s))).toBe("my-post-3");
  });

  it("falls back to 'post' for empty input", () => {
    expect(uniqueSlug("!!!", () => false)).toBe("post");
  });
});
