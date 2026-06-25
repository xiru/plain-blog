import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Image float support.
 *
 * Posts are written in plain Markdown. To make an image float so the text wraps
 * around it, prefix the image's alt text with an alignment token and a pipe:
 *
 *   ![left|A caption](/images/photo.jpg)    -> floats left, text wraps right
 *   ![right|A caption](/images/photo.jpg)   -> floats right, text wraps left
 *   ![center|A caption](/images/photo.jpg)  -> centered block, no wrap
 *   ![wide|A caption](/images/photo.jpg)    -> full content width
 *   ![A caption](/images/photo.jpg)         -> default inline block
 *
 * The token is removed from the alt text and turned into a CSS class
 * (`img-left`, `img-right`, `img-center`, `img-wide`). All the visual tuning
 * lives in those classes in public/css/style.css, so styles are easy to adjust.
 */
const FLOAT_TOKENS: Record<string, string> = {
  left: "img-left",
  right: "img-right",
  center: "img-center",
  wide: "img-wide",
};

function buildRenderer(): marked.RendererObject {
  return {
    image(href: string | null, _title: string | null, text: string): string {
      let cls = "img-block";
      let alt = text || "";
      const match = /^([a-z]+)\|(.*)$/i.exec(alt);
      if (match && FLOAT_TOKENS[match[1].toLowerCase()]) {
        cls = FLOAT_TOKENS[match[1].toLowerCase()];
        alt = match[2].trim();
      }
      const safeHref = href || "";
      const figcaption = alt
        ? `<figcaption>${escapeHtml(alt)}</figcaption>`
        : "";
      return (
        `<figure class="post-figure ${cls}">` +
        `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(alt)}" loading="lazy">` +
        figcaption +
        `</figure>`
      );
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img",
    "figure",
    "figcaption",
    "h1",
    "h2",
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "loading"],
    figure: ["class"],
    a: ["href", "name", "target", "rel"],
    code: ["class"],
    span: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "data"],
};

/** Renders Markdown to sanitized HTML, with floating-image support. */
export function renderMarkdown(md: string): string {
  marked.use({ renderer: buildRenderer() });
  const raw = marked.parse(md || "", { async: false }) as string;
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}

/** Renders Markdown and strips all tags, for plain-text excerpts/feeds. */
export function renderPlainText(md: string, maxLen = 280): string {
  const html = marked.parse(md || "", { async: false }) as string;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}
