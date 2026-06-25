/**
 * Turns an arbitrary title into a URL-safe slug.
 * Permalinks are built from the slug and are immutable once a post is created.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics -> dash
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Given a desired slug and a predicate that reports whether a slug is already
 * taken, returns the first available variant (`slug`, `slug-2`, `slug-3`, ...).
 */
export function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  const slug = slugify(base) || "post";
  if (!exists(slug)) return slug;
  let n = 2;
  while (exists(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
