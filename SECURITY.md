# Security

This document reports the security review of **plain-blog**, the mitigations
applied, and operational guidance. The review was structured around the
[OWASP Top 10 (2021)](https://owasp.org/Top10/), with extra attention — per
request — to **SQL injection** and **path traversal** (serving files/images
outside their intended folder).

- **Scope:** all application source under `src/`, the EJS templates, the upload
  handling, and static-file serving.
- **Last reviewed:** 2026-06-26.
- **Result:** no SQL injection or path-traversal vulnerabilities were found.
  Several hardening gaps (missing security headers, SVG-upload XSS vector,
  session fixation, insecure-by-default cookie/secret handling) were fixed in
  this pass. All fixes are covered by automated tests.

---

## OWASP Top 10 (2021) summary

| # | Category | Status | Notes |
|---|----------|--------|-------|
| A01 | Broken Access Control | ✅ Mitigated | Admin routes gated by `requireAdmin`; single-account allowlist. Path traversal not possible (see below). `DISABLE_AUTH` is an intentional dev toggle — see warning. |
| A02 | Cryptographic Failures | ✅ Mitigated | Session cookie is `httpOnly`, `sameSite=lax`, and `secure` over HTTPS. Startup warns on default `SESSION_SECRET`. |
| A03 | Injection (SQL / XSS) | ✅ Mitigated | All SQL uses parameterized statements. Markdown is sanitized; CSP restricts scripts; output is auto-escaped by EJS. |
| A04 | Insecure Design | ✅ Addressed | Minimal attack surface (no comments, no user accounts). The `DISABLE_AUTH` default is documented and warned about at boot. |
| A05 | Security Misconfiguration | ✅ Mitigated | Added CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS; disabled `X-Powered-By`; added a non-leaking error handler; body-size limits. |
| A06 | Vulnerable & Outdated Components | ✅ Acceptable | **Production dependencies: 0 known vulnerabilities.** The 4 `npm audit` findings are dev-only (esbuild/vite/vitest) and are pruned from the Docker image. |
| A07 | Identification & Auth Failures | ✅ Mitigated | Google OpenID Connect; ID token verified server-side; session regenerated on login (anti session-fixation); logout destroys the session. |
| A08 | Software & Data Integrity Failures | ✅ N/A | No untrusted deserialization, plugins, or auto-update mechanisms. |
| A09 | Logging & Monitoring Failures | ⚠️ Basic | Errors are logged server-side; no audit log. Acceptable for a single-author blog; see recommendations. |
| A10 | Server-Side Request Forgery | ✅ N/A | No outbound requests are built from user input. The only external call is the fixed Google OAuth token exchange. |

---

## Focus area 1 — SQL injection (A03)

**Finding: not vulnerable.**

Every database access goes through `better-sqlite3` **prepared statements** with
`?` placeholders; no user input is concatenated into SQL. See
[`src/lib/posts.ts`](src/lib/posts.ts) and [`src/db.ts`](src/db.ts).

```ts
this.db.prepare(`SELECT * FROM posts WHERE slug = ?`).get(slug);
```

The conditional fragments in `list` / `listByTag` / `allTags` (the
`includeDrafts` filter) are **static string literals chosen by code**, never
derived from user input, so they cannot be used for injection.

**Evidence (tests in [`test/security.test.ts`](test/security.test.ts)):** inputs
like `' OR '1'='1` and `'; DROP TABLE posts; --` are treated as literal data —
they match nothing, drop no tables, and bypass no filters.

---

## Focus area 2 — Path traversal / files outside their folder (A01)

**Finding: not vulnerable.**

Two areas could in principle expose unintended files:

1. **Static serving** of `/images` (uploads) and `/assets` (CSS/JS/branding).
   Both use `express.static`, which normalizes the path and rejects `..`
   traversal and encoded variants (`%2e%2e`, `%2f`). Requests such as
   `/images/../../package.json` return a non-200 and never leak file contents.

2. **Upload filenames.** A malicious client could send a multipart filename like
   `../../../../etc/passwd`. The stored name is **not** taken from the client —
   it is rebuilt as `slugify(basename) + timestamp + ext`
   ([`src/routes/admin.ts`](src/routes/admin.ts)), and `slugify` strips
   everything except `[a-z0-9-]`, so a path separator can never reach the
   filesystem. Files are always written inside `IMAGES_DIR`.

**Evidence:** `test/security.test.ts` asserts traversal attempts against both
`/images` and `/assets` do not return file contents.

---

## Fixes applied in this review

### Cross-Site Scripting (A03)
- **Markdown is sanitized** with `sanitize-html` after rendering, and the renderer
  only allows `http/https/mailto/data` URL schemes — `javascript:` is blocked
  ([`src/lib/markdown.ts`](src/lib/markdown.ts)). EJS auto-escapes all interpolated
  values (`<%= %>`); only the pre-sanitized post body uses `<%- %>`.
- **Content-Security-Policy** added: `script-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'`. To enforce this, inline scripts
  and inline event handlers were moved to [`public/js/admin.js`](public/js/admin.js).
- **SVG uploads are rejected.** An uploaded SVG served from `/images` can carry
  inline scripts that execute on direct navigation. Uploads are now restricted to
  a raster allowlist (`jpg/jpeg/png/gif/webp/avif`) validated by **both** MIME type
  and file extension, and `X-Content-Type-Options: nosniff` is sent.

### Security misconfiguration (A05)
- Added response headers on every request: `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, and `Strict-Transport-Security` (HTTPS only).
- Disabled the `X-Powered-By: Express` banner.
- Added a central **error handler** that logs server-side and renders a generic
  page — stack traces are never sent to clients.
- Added request **body-size limits** (1 MB for forms/JSON; 10 MB / 1 file for
  uploads) to bound abuse.

### Authentication & session (A02 / A07)
- The session is **regenerated on login** to prevent session fixation
  ([`src/routes/auth.ts`](src/routes/auth.ts)).
- The session cookie is `httpOnly`, `sameSite=lax` (mitigates CSRF on state-changing
  POSTs), and `secure` when `SITE_URL` is HTTPS. `trust proxy` is enabled behind TLS.
- Startup **warns** when `SESSION_SECRET` is still the insecure default.

---

## Known operational risks & recommendations

1. **`DISABLE_AUTH=true` is the default.** This intentionally opens `/admin` for
   local development. A loud warning is printed at startup. **Set
   `DISABLE_AUTH=false` and a strong `SESSION_SECRET` before deploying.** See
   [AUTH.md](AUTH.md).
2. **CSRF.** Cross-site request forgery is mitigated by `sameSite=lax` cookies
   (browsers do not send the session cookie on cross-site POSTs). For defense in
   depth you may add per-form CSRF tokens.
3. **Dev-dependency advisories.** `npm audit` reports issues in esbuild/vite/vitest.
   These affect only the local test runner (the Vitest UI server) and are **not**
   shipped — the Docker image runs `npm prune --omit=dev`. They are left as-is to
   keep Vitest 0.34 (Node 16 compatible); upgrade if you move to Node 18+.
4. **Rate limiting / monitoring.** There is no rate limiting or audit log. For a
   single-author blog this is low risk; add a reverse-proxy rate limit if exposed
   to heavy traffic.
5. **Serve behind HTTPS.** Terminate TLS at a proxy and set `SITE_URL` to the
   `https://` origin so secure cookies and HSTS take effect.

---

## Security test coverage

Automated tests in [`test/security.test.ts`](test/security.test.ts) and
[`test/routes.test.ts`](test/routes.test.ts) verify:

- security headers are present and `X-Powered-By` is absent;
- HSTS / secure cookies only over HTTPS;
- path-traversal attempts on `/images` and `/assets` do not leak files;
- SQL-injection payloads are treated as data;
- SVG and disguised non-image uploads are rejected, genuine rasters accepted;
- access control: unauthenticated users are redirected from `/admin`, drafts are
  hidden from non-owners, and only the allowlisted Google account is accepted.

Run them with `npm test`.

---

## Reporting a vulnerability

If you discover a security issue, please report it privately to the repository
owner rather than opening a public issue. Include steps to reproduce and the
affected version/commit.
