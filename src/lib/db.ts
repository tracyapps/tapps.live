// SQLite layer — one file-backed database, lazily opened, auto-migrated and
// seeded on first run. Content lives here so the admin CMS edits real rows
// and the public pages always render from one source of truth.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

// Database location: DATA_DIR env → absolute; otherwise <project root>/data.
// The root is the launch cwd (set TAPPS_ROOT to override) because the
// bundled import.meta.url points into dist/ in production builds.
function dataDir(): string {
  loadEnv();
  const custom = process.env.DATA_DIR;
  if (custom && path.isAbsolute(custom)) return custom;
  const root = process.env.TAPPS_ROOT
    ? path.resolve(process.env.TAPPS_ROOT)
    : process.cwd();
  return custom ? path.join(root, custom) : path.join(root, "data");
}

export type DB = Database.Database;

let db: DB | null = null;

export function getDB(): DB {
  if (db) return db;
  loadEnv();
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "tapps-live.sqlite"));
  db.pragma("journal_mode = WAL");
  migrate(db);
  seed(db);
  return db;
}

/** Test helper: run against an in-memory database instead of the file. */
export function useTestDB(): DB {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  migrate(db);
  seed(db);
  return db;
}

export function closeDB(): void {
  db?.close();
  db = null;
}

function migrate(d: DB) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nav_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      external INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      kicker TEXT DEFAULT '',
      intro TEXT DEFAULT '',
      blocks TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT DEFAULT '',
      url TEXT DEFAULT '',
      repo TEXT DEFAULT '',
      roadmap_path TEXT DEFAULT 'ROADMAP.md',
      status TEXT NOT NULL DEFAULT 'live',
      status_label TEXT DEFAULT '',
      since TEXT DEFAULT '',
      fill TEXT DEFAULT '',
      progress INTEGER,
      stack TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      roadmap TEXT NOT NULL DEFAULT '[]',
      sort INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'social',
      name TEXT NOT NULL,
      handle TEXT DEFAULT '',
      url TEXT NOT NULL,
      fill TEXT DEFAULT '',
      note TEXT DEFAULT '',
      screenshot_id INTEGER,
      visible INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      last_refresh_at TEXT,
      last_status TEXT NOT NULL DEFAULT 'unknown',
      last_error TEXT,
      last_duration_ms INTEGER,
      last_item_count INTEGER
    );
    CREATE TABLE IF NOT EXISTS feed_items (
      feed_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      published_at TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY (feed_id, guid)
    );
    CREATE TABLE IF NOT EXISTS feed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_feed_events_feed ON feed_events (feed_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_items_feed ON feed_items (feed_id, published_at DESC);
  `);
}

function migrateSettingsUpgrade(d: DB) {
  // placeholder for future column additions — keep migrations additive
  void d;
}

export function logFeedEvent(
  feedId: string,
  level: "ok" | "error" | "info",
  message: string,
  detail?: string
) {
  const d = getDB();
  d.prepare(
    "INSERT INTO feed_events (feed_id, level, message, detail) VALUES (?, ?, ?, ?)"
  ).run(feedId, level, message, detail ?? null);
  // cap history at 200 rows
  d.prepare(
    `DELETE FROM feed_events WHERE id NOT IN (
       SELECT id FROM feed_events ORDER BY id DESC LIMIT 200
     )`
  ).run();
}

// ─── seed ───────────────────────────────────────────────────────────────
// Content mirrored from the design export (_design-Tapps-Dev-Hub-Site/assets/data.js)
// so day one looks exactly like the approved design.

function seed(d: DB) {
  const count = d.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
  if (count.n > 0) return; // already seeded
  migrateSettingsUpgrade(d);

  const insertProject = d.prepare(`
    INSERT INTO projects (slug, name, tagline, url, repo, roadmap_path, status, status_label, since, fill, progress, stack, tags, roadmap, sort)
    VALUES (@slug, @name, @tagline, @url, @repo, @roadmap_path, @status, @status_label, @since, @fill, @progress, @stack, @tags, @roadmap, @sort)
  `);

  const projects = [
    {
      slug: "papr-world", name: "papr.world",
      tagline: "A cozy communal sandbox where the trees, the river, the little house you build — and you — are all made of paper.",
      url: "https://papr.world", repo: "", roadmap_path: "ROADMAP.md",
      status: "alpha", status_label: "Invite-only alpha", since: "2025 — now",
      fill: "fill-grape", progress: 61,
      stack: ["TypeScript", "Three.js", "Colyseus", "Astro"],
      tags: ["game design", "ux", "llm-assisted dev", "cozy co-op"],
      roadmap: [
        { label: "The foundation", pct: 100 }, { label: "Plans & knowledge tree", pct: 100 },
        { label: "Critter knowledge", pct: 100 }, { label: "The invited alpha", pct: 83 },
        { label: "Economy, shops, mail", pct: 44 }, { label: "Water: rivers & lakes", pct: 9 },
        { label: "The map, then underground", pct: 0 }, { label: "Becoming someone", pct: 0 }
      ], sort: 0
    },
    {
      slug: "exp-design", name: "EXP [design]",
      tagline: "A native macOS design tool built around how UX work actually happens, instead of how design tools like to be demoed.",
      url: "https://expdesign.app", repo: "tracyapps/EXP-design", roadmap_path: "ROADMAP.md",
      status: "beta", status_label: "Tester beta", since: "v2.2 / build 13",
      fill: "fill-magenta", progress: 84,
      stack: ["Swift", "AppKit", "Core Graphics"],
      tags: ["product", "ux", "app design", "design systems", "handoff"],
      roadmap: [
        { label: "Canvas & component system", pct: 100 }, { label: "Accessibility at the core", pct: 100 },
        { label: "Design language + tokens", pct: 100 }, { label: "Bring in / hand onward", pct: 92 },
        { label: "CodeBridgeManifest foundation", pct: 70 }, { label: "v2.3 discovery queue", pct: 18 }
      ], sort: 1
    },
    {
      slug: "webproduction", name: "WebProduction Studio",
      tagline: "An open production system that makes WordPress sites your clients aren't afraid to touch.",
      url: "https://webproduction.studio", repo: "", roadmap_path: "ROADMAP.md",
      status: "build", status_label: "Day one · built in public", since: "2026",
      fill: "fill-sun", progress: 14,
      stack: ["WordPress", "Modules", "Agents"],
      tags: ["open foundations", "editing ux", "agency tooling"],
      roadmap: [
        { label: "Definition & validation", pct: 60 }, { label: "Single-site proof", pct: 8 },
        { label: "Agency kit", pct: 0 }, { label: "WPS alpha", pct: 0 }
      ], sort: 2
    },
    {
      slug: "doku", name: "*doku",
      tagline: "A little logic, a lot of possibility — a puzzle game with leaderboards, history, and a Web 2.0 soul.",
      url: "https://stardoku.app", repo: "", roadmap_path: "ROADMAP.md",
      status: "live", status_label: "Live", since: "2025",
      fill: "fill-lime", progress: 78,
      stack: ["Web", "Discord", "Leaderboards"],
      tags: ["game design", "front-end", "community"],
      roadmap: [
        { label: "Play modes & moods", pct: 100 }, { label: "Leaderboards + history", pct: 100 },
        { label: "How to play & onboarding", pct: 100 }, { label: "Discord integration", pct: 80 },
        { label: "Roadmap & feedback loop", pct: 35 }
      ], sort: 3
    },
    {
      slug: "e-f", name: "e-f.online",
      tagline: "Executive Function — a calmer place for tangled thoughts, shifting energy, and days that refuse to fit a normal planner.",
      url: "https://e-f.online", repo: "", roadmap_path: "ROADMAP.md",
      status: "beta", status_label: "Private build", since: "2026",
      fill: "fill-mint", progress: 38,
      stack: ["Web", "Audio", "Local-first"],
      tags: ["AuDHD-friendly", "accessibility", "product"],
      roadmap: [
        { label: "Now / Next / Later model", pct: 100 }, { label: "Energy cues & focus sound", pct: 70 },
        { label: "Private + shared spaces", pct: 45 }, { label: "The full visual story", pct: 10 }
      ], sort: 4
    },
    {
      slug: "draw-tionary", name: "Draw-tionary",
      tagline: "Pictionary for friends who are never online at the same time. No timer, anywhere — draw alone, share when ready.",
      url: "https://draw-tionary.app", repo: "tracyapps/draw-tionary", roadmap_path: "ROADMAP.md",
      status: "live", status_label: "Live", since: "2025",
      fill: "fill-tang", progress: 72,
      stack: ["Discord", "Web", "Canvas"],
      tags: ["game design", "community", "friendly-by-default"],
      roadmap: [
        { label: "Word prompting + private links", pct: 100 }, { label: "Stroke-by-stroke playback", pct: 100 },
        { label: "124 free colors", pct: 100 }, { label: "Pressure-sensitive drawing", pct: 100 },
        { label: "Support & moderation", pct: 60 }
      ], sort: 5
    },
    {
      slug: "synamp", name: "synamp.app",
      tagline: "In the lab. There is no public roadmap online yet — that is on purpose, until the thing can explain itself.",
      url: "https://synamp.app", repo: "", roadmap_path: "ROADMAP.md",
      status: "soon", status_label: "No public roadmap yet", since: "soon",
      fill: "fill-hot", progress: null,
      stack: ["TBD"], tags: ["experiment", "unannounced"],
      roadmap: [], sort: 6
    },
    {
      slug: "plugins", name: "Plugins & bits",
      tagline: "The small sharp tools: a starter theme, a plugin core, an Astro toy, and a CSS reset that gets better.",
      url: "https://github.com/tracyapps", repo: "", roadmap_path: "ROADMAP.md",
      status: "live", status_label: "Mixed · open source", since: "ongoing",
      fill: "fill-magenta", progress: 66,
      stack: ["PHP", "CSS", "Astro"],
      tags: ["plugins", "starter theme", "open source"],
      roadmap: [
        { label: "start — starter theme", pct: 100 }, { label: "zaobank-core plugin", pct: 100 },
        { label: "burn-it-down (Astro)", pct: 55 }, { label: "it gets better (CSS)", pct: 40 }
      ], sort: 7
    }
  ];

  const tx = d.transaction(() => {
    for (const p of projects) {
      insertProject.run({
        ...p,
        stack: JSON.stringify(p.stack),
        tags: JSON.stringify(p.tags),
        roadmap: JSON.stringify(p.roadmap)
      });
    }

    const nav = [
      ["Home", "/", 0],
      ["Projects", "/projects", 1],
      ["Activity", "/activity", 2],
      ["Live", "/live", 3],
      ["Art", "/art", 4],
      ["About", "/about", 5],
      ["Links", "/links", 6]
    ];
    const insertNav = d.prepare(
      "INSERT INTO nav_items (label, href, sort) VALUES (?, ?, ?)"
    );
    for (const [label, href, sort] of nav) insertNav.run(label, href, sort);

    const insertLink = d.prepare(`
      INSERT INTO links (kind, name, handle, url, fill, note, sort)
      VALUES (@kind, @name, @handle, @url, @fill, @note, @sort)
    `);
    const links = [
      { kind: "social", name: "TikTok", handle: "@therealtapps", url: "https://tiktok.com/@therealtapps", fill: "fill-magenta", note: "video", sort: 0 },
      { kind: "social", name: "Instagram", handle: "@tapps", url: "https://instagram.com/tapps", fill: "fill-tang", note: "photo", sort: 1 },
      { kind: "social", name: "Bluesky", handle: "@tapp.ps", url: "https://bsky.app/profile/tapp.ps", fill: "fill-mint", note: "text", sort: 2 },
      { kind: "social", name: "YouTube", handle: "youtube.com/tracyapps", url: "https://youtube.com/tracyapps", fill: "fill-hot", note: "video", sort: 3 },
      { kind: "social", name: "GitHub", handle: "github.com/tracyapps", url: "https://github.com/tracyapps", fill: "fill-sun", note: "code", sort: 4 },
      { kind: "social", name: "Behance", handle: "behance.net/tapps", url: "https://www.behance.net/tapps", fill: "fill-grape", note: "portfolio", sort: 5 },
      { kind: "portfolio", name: "tapps.design", handle: "", url: "https://tapps.design", fill: "fill-magenta", note: "main portfolio", sort: 0 },
      { kind: "portfolio", name: "artbytapps.com", handle: "", url: "https://artbytapps.com", fill: "fill-lime", note: "new design coming soon", sort: 1 },
      { kind: "portfolio", name: "tracyappsdesign.com", handle: "", url: "https://tracyappsdesign.com", fill: "fill-sun", note: "full-service studio", sort: 2 }
    ];
    for (const l of links) insertLink.run(l);

    const setKv = d.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)");
    setKv.run("profile", JSON.stringify({
      name: "tracy apps",
      handle: "@tapps",
      role: "creative problem solver",
      location: "Milwaukee, Wisconsin",
      eyebrow: "Milwaukee · product designer · creative problem solver",
      blurb: "20+ years leading product design start-to-finish for startups and Fortune 500s. Lately: building software, games, and apps by pairing a designer's brain with LLMs. Broad and varied on purpose — it's always been the superpower.",
      shortBlurb: "Designer, developer, artist, teacher, drummer, bowtie enthusiast. Building in public from Milwaukee, Wisconsin.",
      email: "tracyapps@gmail.com",
      phone: "414-939-4040",
      calendly: "https://calendly.com/tapps",
      sticker: "★ bowtie count: 180+"
    }));

    setKv.run("page:home", JSON.stringify({
      nowTitle: "Two things at once, on purpose",
      nowBody: "**papr.world** — a cozy paper game where nobody keeps score, and **EXP [design]** — a native macOS design tool that gets out of the way. The rest of the stack is documented below with real progress, not vibes.",
      ctaTitle: "Got a creative puzzle that needs solving?",
      ctaBody: "Product design, consulting, teaching, and building strange wonderful things with LLMs. If it serves people and communities, I'm in."
    }));

    setKv.run("page:about", JSON.stringify({
      bio: [
        "I design things. I code things. I UX… things. Broad and varied on purpose — it's always been the superpower. I pull from a giant crayon box of tools to find the solution that actually works, or to innovate something better.",
        "In the day job I design products and big-data digital platforms, create and code custom WordPress solutions, co-host a podcast, speak internationally on design, and teach web development and UX design at the college level. I'm also an artist, a drummer, a photographer, and the owner of far too many bowties.",
        "Because I'm a woman in tech, and because the web should work for every body, accessibility isn't a checkbox for me — it's the whole point. I create stuff that improves lives, or I don't bother."
      ],
      currently: "papr.world + EXP [design]",
      currentlyNote: "A cozy paper game and a macOS design tool, both built in the open.",
      sticker: "★ ENFP · drummer · cat mom",
      skills: ["strategy", "ux", "ui", "front-end", "llm prototypes", "brand", "teaching", "photography", "video", "podcasting", "accessibility", "product design", "design systems", "WordPress", "handoff"]
    }));

    setKv.run("page:live", JSON.stringify({
      game: "Oxygen Not Included",
      gameBlurb: "A space-colony simulation about thermodynamics, plumbing, and the slow realization that your colony is a house of cards. I'm here for the logistics and the disasters.",
      rulesTitle: "Chill chat, no backseating the oxygen",
      rulesBlurb: "Friendly, inclusive, and low-pressure. Beginners welcome. We will absolutely name a duplicant after you.",
      scheduleNote: "Four nights held open. Nothing confirmed. I'd rather leave a slot blank than miss a promise — so the calendar below is honest about being a placeholder.",
      slots: [
        { day: "Mon", time: "—", note: "open" },
        { day: "Wed", time: "—", note: "open" },
        { day: "Fri", time: "—", note: "open" },
        { day: "Sat", time: "—", note: "open" }
      ]
    }));

    setKv.run("page:links", JSON.stringify({
      heroNote: "Six socials, three portfolios, one inbox. Pick your poison — they all route back to the same human in Milwaukee."
    }));

    // feed rows — github + bluesky work with no keys; the rest surface as
    // "needs config" on the status page until keys are added in admin.
    const insertFeed = d.prepare(
      "INSERT OR REPLACE INTO feeds (id, enabled, config) VALUES (?, ?, ?)"
    );
    insertFeed.run("github", 1, JSON.stringify({ username: "tracyapps" }));
    insertFeed.run("art", 1, JSON.stringify({ feedUrl: "https://artbytapps.com/feed/" }));
    insertFeed.run("youtube", 0, JSON.stringify({ channelId: "" }));
    insertFeed.run("twitch", 1, JSON.stringify({ login: "tracyapps" }));
    insertFeed.run("lastfm", 0, JSON.stringify({ user: "tracyapps" }));
    insertFeed.run("bluesky", 1, JSON.stringify({ actor: "tapp.ps" }));
  });
  tx();
}

// ─── typed accessors ────────────────────────────────────────────────────

export function getKv<T>(key: string, fallback: T): T {
  const row = getDB().prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setKv(key: string, value: unknown): void {
  getDB()
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run(key, JSON.stringify(value));
}

export interface RoadmapRow {
  label: string;
  pct: number;
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  url: string;
  repo: string;
  roadmap_path: string;
  status: string;
  status_label: string;
  since: string;
  fill: string;
  progress: number | null;
  stack: string[];
  tags: string[];
  roadmap: RoadmapRow[];
  sort: number;
  updated_at: string;
}

export function rowToProject(row: Record<string, unknown>): Project {
  return {
    ...(row as unknown as Project),
    stack: JSON.parse((row.stack as string) || "[]"),
    tags: JSON.parse((row.tags as string) || "[]"),
    roadmap: JSON.parse((row.roadmap as string) || "[]")
  };
}

export function getProjects(): Project[] {
  return (
    getDB()
      .prepare("SELECT * FROM projects ORDER BY sort, id")
      .all() as Record<string, unknown>[]
  ).map(rowToProject);
}

export function getProject(slug: string): Project | null {
  const row = getDB().prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToProject(row) : null;
}

export interface LinkItem {
  id: number;
  kind: string;
  name: string;
  handle: string;
  url: string;
  fill: string;
  note: string;
  screenshot_id: number | null;
  visible: boolean;
  sort: number;
}

export function rowToLink(row: Record<string, unknown>): LinkItem {
  return {
    ...(row as unknown as LinkItem),
    visible: !!row.visible
  };
}

export function getLinks(kind?: string): LinkItem[] {
  const rows = kind
    ? (getDB().prepare("SELECT * FROM links WHERE kind = ? ORDER BY sort, id").all(kind) as Record<string, unknown>[])
    : (getDB().prepare("SELECT * FROM links ORDER BY sort, id").all() as Record<string, unknown>[]);
  return rows.filter((r) => r.visible).map(rowToLink);
}

export function getAllLinks(kind?: string): LinkItem[] {
  const rows = kind
    ? (getDB().prepare("SELECT * FROM links WHERE kind = ? ORDER BY sort, id").all(kind) as Record<string, unknown>[])
    : (getDB().prepare("SELECT * FROM links ORDER BY sort, id").all() as Record<string, unknown>[]);
  return rows.map(rowToLink);
}

export interface NavItem {
  id: number;
  label: string;
  href: string;
  sort: number;
  visible: boolean;
  external: boolean;
}

export function getNav(visibleOnly = true): NavItem[] {
  const rows = getDB().prepare("SELECT * FROM nav_items ORDER BY sort, id").all() as Record<string, unknown>[];
  return rows
    .filter((r) => (visibleOnly ? r.visible : true))
    .map((r) => ({
      id: r.id as number,
      label: r.label as string,
      href: r.href as string,
      sort: r.sort as number,
      visible: !!r.visible,
      external: !!r.external
    }));
}
