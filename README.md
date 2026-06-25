# plain-blog

A small, modern Markdown blog for a software engineer. Server-rendered, no
client framework, few moving parts.

- **Posts in Markdown** with title, date, a Markdown body, and multiple tags.
- **SQLite** storage (`better-sqlite3`).
- **Permalinks** — once a post is created its URL (`/posts/<slug>`) never changes,
  even if you rename the title.
- **Tag navigation** — browse posts by tag at `/tags/<tag>`.
- **RSS feed** of every post, newest first, at `/rss.xml`.
- **Floating images** — text wraps around images, controlled from CSS variables.
- **Google sign-in** for publishing, restricted to a single account.
- **No comments.**
- Fixed list of social links (Twitter, GitHub, LinkedIn, SlideShare, Flickr,
  Facebook, Instagram) shown on every page.
- Fully unit-tested, Dockerized, with a `docker-compose` for local runs.

## Tech stack

TypeScript · Express · EJS templates · better-sqlite3 · marked · Vitest.

## Quick start (local, without Docker)

```bash
cp .env.example .env      # then edit values
npm install
npm run dev               # http://localhost:3000
```

Build & run the compiled server:

```bash
npm run build
npm start
```

## Quick start (Docker)

```bash
cp .env.example .env      # set GOOGLE_CLIENT_ID/SECRET, SITE_URL, social links
docker compose up --build
```

The site responds at the root of `SITE_URL` (configurable). SQLite lives in the
`blog-data` volume; uploaded images are bind-mounted to `./images`.

## Tests

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
```

> Note: the test runner (Vitest 0.34) and the app target Node 16+. The Docker
> image uses Node 20.

## Configuration

All configuration is via environment variables — see [`.env.example`](.env.example).
Key ones:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public base URL; drives permalinks, RSS links and the OAuth redirect. |
| `ADMIN_EMAIL` | The **only** Google account allowed to publish (default `fabiano.weimar@gmail.com`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials. |
| `DB_PATH` | SQLite file path. |
| `IMAGES_DIR` | Where uploaded images are stored (served at `/images`). |
| `SOCIAL_*` | Social profile URLs; blank ones are hidden. |

### Google OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an **OAuth 2.0 Client ID** (type: Web application).
2. Add an **Authorized redirect URI**: `<SITE_URL>/auth/google/callback`
   (e.g. `http://localhost:3000/auth/google/callback`).
3. Put the client id/secret in `.env`.

Anyone can click "Sign in", but only `ADMIN_EMAIL` is allowed past the gate.

> 📖 Passo a passo detalhado (em português) para configurar uma conta Gmail
> comum: **[AUTH.md](AUTH.md)**.

## Customizing the site images

Boilerplate SVG placeholders live in [`public/img/`](public/img/) and are served
under `/assets/img/`:

| File | Used for | Env override |
| --- | --- | --- |
| `avatar.svg` | Profile photo in the home hero | `IMG_AVATAR` |
| `header-bg.svg` | Home hero banner background | `IMG_HEADER` |
| `favicon.svg` | Browser tab icon | `IMG_FAVICON` |
| `og-image.svg` | Social-share (Open Graph) preview | `IMG_OG` |

To use your own photos, either **replace the files** in `public/img/` (keep the
names) or point the `IMG_*` env vars at any path/URL. Raster images (JPG/PNG)
work too — e.g. `IMG_AVATAR=/assets/img/avatar.jpg`. For social previews,
exporting `og-image` to PNG/JPG is recommended for broad platform support.

## Writing posts

Sign in, go to **/admin**, and create a post. The body is Markdown.

### Images that float

Upload an image from the editor (stored under `/images`), then use the inserted
Markdown. Prefix the alt text with an alignment token to control text wrapping:

```markdown
![left|A caption](/images/photo.jpg)     text wraps to the right
![right|A caption](/images/photo.jpg)    text wraps to the left
![center|A caption](/images/photo.jpg)   centered, no wrap
![wide|A caption](/images/photo.jpg)     full content width
![A caption](/images/photo.jpg)          default block
```

Tune size and spacing in [`public/css/style.css`](public/css/style.css) via the
`--img-float-width`, `--img-float-gap`, and `--img-radius` variables — no code
changes needed.

## Project layout

```
src/
  config.ts          environment config + social links
  db.ts              SQLite connection & schema
  app.ts             Express app factory (testable, no listen)
  server.ts          entrypoint
  lib/
    slug.ts          permalink slug generation
    markdown.ts      Markdown -> sanitized HTML, floating images
    posts.ts         PostRepository (CRUD, tags)
    rss.ts           RSS 2.0 feed builder
    auth.ts          Google OAuth + admin authorization
  routes/
    public.ts        home, post, tag, rss
    auth.ts          login / oauth callback / logout
    admin.ts         dashboard, post CRUD, image upload
views/               EJS templates
public/css/style.css theme (edit CSS variables to restyle)
test/                Vitest unit + integration tests
```

## License

MIT
