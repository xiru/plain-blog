import { describe, it, expect } from "vitest";
import { renderMarkdown, renderPlainText } from "../src/lib/markdown";

describe("renderMarkdown", () => {
  it("renders basic markdown", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** text.");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("wraps images in a figure with the default class", () => {
    const html = renderMarkdown("![A cat](/images/cat.jpg)");
    expect(html).toContain('class="post-figure img-block"');
    expect(html).toContain('src="/images/cat.jpg"');
    expect(html).toContain("<figcaption>A cat</figcaption>");
  });

  it("applies a float-left class from the alt prefix", () => {
    const html = renderMarkdown("![left|A cat](/images/cat.jpg)");
    expect(html).toContain("img-left");
    expect(html).toContain("<figcaption>A cat</figcaption>");
    expect(html).not.toContain("left|");
  });

  it("supports right, center and wide tokens", () => {
    expect(renderMarkdown("![right|x](/a.jpg)")).toContain("img-right");
    expect(renderMarkdown("![center|x](/a.jpg)")).toContain("img-center");
    expect(renderMarkdown("![wide|x](/a.jpg)")).toContain("img-wide");
  });

  it("treats unknown tokens as part of the caption", () => {
    const html = renderMarkdown("![nope|x](/a.jpg)");
    expect(html).toContain("img-block");
    expect(html).toContain("nope|x");
  });

  it("sanitizes script tags", () => {
    const html = renderMarkdown("Hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });
});

describe("renderPlainText", () => {
  it("strips markdown/html and trims", () => {
    expect(renderPlainText("# Hi\n\n**there**")).toBe("Hi there");
  });

  it("truncates long text with an ellipsis", () => {
    const out = renderPlainText("word ".repeat(100), 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
  });
});
