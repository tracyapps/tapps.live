# tapps.live

The live hub for tracy apps (@tapps): projects status board, GitHub activity, stream frames, art feed, links — all fed by switchable integrations, all editable through a built-in admin console.

Built on the approved design export in `_design-Tapps-Dev-Hub-Site/` (The Verge-derived token system, Space Grotesk / Inter / IBM Plex Mono, duotone ink press) with one systemic repair: **every colored "fill" surface now carries its own contrast-verified ink**, so the grey-text-on-green glitches from the export cannot recur. The math is enforced by `tests/contrast.test.ts` and rendered live on `/system`.

## Stack

- **Astro 5 (SSR, Node standalone)** — pages render on the server from SQLite; third-party APIs never block a page render
- **better-sqlite3** — content, feed cache, media, event log (auto-created + seeded on first boot at `data/tapps-live.sqlite`)
- **Vanilla JS islands** — nav, clock, reveals, counters, stream filters, colorway rerolls; no client framework
- **Vitest** — 45 tests: parsers, normalizers, roadmap parser, auth, contrast contract

## Quick start

```bash
npm install
cp .env.example .env       # set ADMIN_PASSWORD + SESSION_SECRET
npm run dev                # http://localhost:4321
```

Production:

```bash
npm run build
node dist/server/entry.mjs # PORT=4321 by default; run from the project root
```

The database lives at `<project root>/data/` (override with `DATA_DIR`, root with `TAPPS_ROOT`). First boot seeds all content from the design export — projects, links, nav, page copy.

## Sitemap

| Route | What |
|---|---|
| `/` | Hub: hero, live signal strip, ticker, on-deck projects, now-building, stream, latest art, socials, CTA |
| `/projects` | Status board: every project, progress charts, real GitHub heatmap, roadmap accordions |
| `/activity` | GitHub event stream with type filters, event mix, live language split, recently-pushed repos |
| `/live` | Twitch live status + embedded player when live; broadcast frames, schedule, latest videos |
| `/art` | Latest artwork from artbytapps.com RSS, each piece pressed through a randomized duotone colorway |
| `/about` ` `/links` | Bio / link wall + portfolios (duotone screenshots) + contact |
| `/system` | The design system: tokens, **live WCAG contrast table**, type scale, ink press gallery |
| `/admin` | The console (below) |
| `/<any-slug>` | Custom pages you create in the admin |

## The admin console (`/admin`)

- **Dashboard** — content counts, feed health, what needs attention
- **Content** — edit copy on every built-in page; build custom pages from blocks (heading / text / image / links / CTA / ticker)
- **Projects** — full CRUD + ordering; roadmap phases editable as `label | %` lines
- **Links** — socials + portfolios, ordering, visibility, screenshot upload (stored in SQLite, served from `/media/:id`)
- **Nav** — reorder / rename / hide / add nav items; order here is order everywhere
- **Feeds** — every integration with an on/off switch and its config form; saving runs a connection test then a first refresh
- **Status** — the connection console: per-feed test + refresh buttons, last-refresh times, error details, event log; auto-refreshes while open. Same tests run headless: `npm run feeds:test`
- **Settings** — profile info used across the site + the live a11y contract check

Auth is a single admin password (`ADMIN_PASSWORD`), HMAC-signed session cookie (12h, SameSite=strict), CSRF token on every form, origin checks on POSTs.

## Feeds

| Feed | Keys needed | Refresh | What it powers |
|---|---|---|---|
| GitHub | none (PAT optional) | 10m | Activity stream, heatmap, language split, roadmap sync |
| Art (artbytapps.com) | none — RSS | 30m | `/art` wall + home teaser (works through the redesign; same `/feed/` URL) |
| Bluesky | none | 15m | Latest posts |
| Twitch | client id + secret | 3m | LIVE badge, signal strip, embedded player |
| YouTube | channel ID (`UC…`) | 15m | Latest videos strip |
| last.fm | API key | 5m | "Colony soundtrack" on `/live` — now-playing (spinning disc) + recent tracks, plus the home signal strip |

Instagram/TikTok are listed as **link-only** on the status page — no public content API exists without reviewed apps.

Config precedence: **admin console values → env vars** (env wins if both set). Unconfigured feeds report `needs-config` — never fake-offline.

### ROADMAP.md sync

Point a project at a repo (`owner/name`) in the admin and the GitHub feed will read `ROADMAP.md` from the default branch every refresh:

```md
# project roadmap
progress: 61            ← optional headline override

## The invited alpha
<!-- 83 -->             ← optional explicit phase %
- [x] invites flowing
- [ ] stress test the mail
```

Phase % = checked/total (or the explicit override); project % = task-weighted average (or the `progress:` line). A file with headings but no checkboxes is skipped — manual roadmaps in the admin stay authoritative until the repo ships a real one.

## The duotone ink press

The export baked posters with ImageMagick; the live site presses the same nine ink pairs with SVG `feComponentTransfer` filters (defined once in `BaseLayout.astro`). Any image — portfolio screenshots, art feed thumbnails, video thumbnails — gets a deterministic colorway from its seed (stable across renders), plus the dot-field + scanline overlays. Hover an image and hit **↻** to cycle inks. `src/lib/palette.ts` is the source of truth.

## Tests

```bash
npm test            # 45 unit tests (offline, fixtures)
npm run feeds:test  # live connection tests (network)
npm run feeds:refresh  # warm every enabled feed's cache now
```

`tests/contrast.test.ts` enforces the a11y contract: every text/background pair the site ships — including all fill inks and the broadcast badge — must pass WCAG AA (≥ 4.5:1), and the export's known failures (white on magenta, grey on lime) are pinned as must-NOT-pass.

## Design notes

- Fills are self-contained: `.fill-lime` (and friends) flip their own ink and every text-bearing descendant — the export's bug was JS-rendered tiles missing the `tile--fill` class, so `.tile p` grey beat the fill overrides. Now the fill class alone is safe.
- The LIVE badge is `#9a2828` (danger darkened) so white 11px mono passes AA; raw `--danger` with white fails at 3.76.
- Verified ratios live in `src/lib/tokens.ts` and render on `/system`.
- Motion respects `prefers-reduced-motion` everywhere; ticker pauses on hover.

## Deploy

**Railway (recommended, fully documented):** see [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md) — `railway.json`, `.nvmrc`, and `.railwayignore` are already in the repo; you add a volume at `/data`, set `ADMIN_PASSWORD` / `SESSION_SECRET` / `DATA_DIR=/data`, and point your domain at it.

Any other Node 20+ host works too (Fly, Render, a VPS with systemd): run `npm run build`, then `node dist/server/entry.mjs` from the project root. Persist `data/` (or set `DATA_DIR` to an absolute path on a persistent volume); everything else — uploads included — lives in SQLite. `/api/health` is the liveness endpoint. `/robots.txt` keeps `/admin` out of crawlers.
