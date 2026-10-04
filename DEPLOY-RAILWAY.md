# Deploying tapps.live to Railway

The app is a long-running Node server (Astro SSR standalone + SQLite + in-process feed scheduler), which is exactly what Railway runs well. Everything below assumes you're in the project root: `/Users/tapps/_dev/other-websites/tapps-live`.

Already in the repo for Railway:

- `railway.json` — Nixpacks build (`npm ci && npm run build`), start (`node dist/server/entry.mjs`), healthcheck against `/api/health`, restart-on-failure
- `.nvmrc` — pins Node 24 (matches local; better-sqlite3 prebuilt binaries resolve correctly)
- `.railwayignore` — keeps `node_modules/`, `dist/`, `data/`, `.env`, and the 30 MB design export out of the upload
- `/api/health` — liveness + feed-count JSON endpoint

## 1. Create the service

**Fastest (CLI, no git needed):**

```bash
npm i -g @railway/cli      # or: brew install railway
railway login
railway init               # pick a name, e.g. "tapps-live"
railway up                 # builds and deploys this directory
```

**Recommended long-term (GitHub → auto-deploys):**

```bash
git init
git add -A && git commit -m "tapps.live hub"
gh repo create tapps-live --private --source=. --push   # or push to an existing repo
```

Then in the Railway dashboard: **New Project → Deploy from GitHub repo → select `tapps-live`.** Every push to the default branch redeploys automatically.

## 2. Attach the volume (this is the important one)

The database must survive restarts, and Railway containers have ephemeral disks except where you mount a volume.

1. In the service, click **+ Volume** (Storage tab / service panel).
2. Mount it at exactly: **`/data`**
3. Add the variable `DATA_DIR=/data` (the app already knows this override).

On first boot the app creates `/data/tapps-live.sqlite`, migrates, and seeds itself with the design content. From then on, all admin edits, feed caches, and uploaded screenshots live on the volume.

## 3. Set environment variables

In the service's **Variables** tab (never commit these):

| Variable | Value | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | your choice | required — login for `/admin` |
| `SESSION_SECRET` | `openssl rand -hex 32` | required — signs sessions + CSRF |
| `DATA_DIR` | `/data` | points at the volume |

Optional (each can also be set later in **Admin → Feeds**, which is the nicer UI for it): `GITHUB_TOKEN`, `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` + `TWITCH_LOGIN`, `LASTFM_API_KEY` + `LASTFM_USER`, `YOUTUBE_CHANNEL_ID`, `ART_FEED_URL`.

Railway sets `NODE_ENV=production` and injects `PORT` automatically — the app picks both up (secure cookies on, correct port). Redeploy after adding variables (Railway prompts you).

## 4. Give it a domain

- **Test domain:** service → **Settings → Networking → Generate Domain**. You immediately get `something.up.railway.app` with TLS.
- **tapps.live:** Settings → Networking → **Custom Domain** → enter `tapps.live`, then at your DNS provider add the `CNAME` record Railway shows you (or `A`/`ALIAS` at the apex if your DNS supports it). TLS is issued automatically.

## 5. Verify

1. `https://<your-domain>/api/health` → `{"ok":true,...,"feeds":{...}}`
2. `/admin` → log in with `ADMIN_PASSWORD`
3. **Admin → Status** → within a minute of booting, GitHub / Bluesky / Art should flip to `ok` (the scheduler runs while the server runs — no cron service needed on Railway)
4. Make any edit in **Admin → Content**, confirm it shows on the public site — that proves the volume is mounted (edits survive a restart)

## Day-2 notes

- **Redeploys:** `railway up` (CLI path) or git push (GitHub path). Brief rolling restart; the volume persists.
- **Scale:** leave it at 1 replica — SQLite is a single-writer database, and one instance is plenty for a personal hub. (The CSRF token and sessions are now replica-safe regardless, but keep 1 for the DB's sake.)
- **Backups:** the whole state is one file — `/data/tapps-live.sqlite`. Download it from the service's storage view occasionally, or copy via `railway ssh`.
- **Cost:** comfortably fits the Hobby tier — this is a small always-on container plus a small volume.
- **Logs / monitoring:** service → **Logs** shows the feed scheduler's refresh lines; **Metrics** shows memory/CPU. `/api/health` works with any uptime monitor too.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Healthcheck failing on first deploy | Check Logs — usually a missing `ADMIN_PASSWORD`/`SESSION_SECRET` or the volume not mounted at `/data` |
| Admin edits disappearing | `DATA_DIR` isn't set or volume isn't attached — the app fell back to ephemeral disk |
| `better-sqlite3` build error | Ensure `.nvmrc` is present (Node 24); Railway's Nixpacks respects it |
| Feeds stuck at "needs config" | Expected for Twitch/last.fm/YouTube until keys are added in Admin → Feeds |
| Logged out unexpectedly | Session cookies are 12h by design; secure cookies require HTTPS (custom/generated domain) |
