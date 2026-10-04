// Refresh runner + scheduler + status aggregation. Public pages only ever
// read the cache (feed_items / feedmeta:*) — third-party APIs can never slow
// down or break a page render.
import { getDB, logFeedEvent, getKv, setKv } from "../lib/db";
import { FEEDS, feedById, LINK_ONLY } from "./registry";
import { effectiveConfig, missingKeys } from "./types";
import type { FeedItem, FeedModule } from "./types";
import { loadEnv } from "../lib/env";

const MAX_ITEMS_PER_FEED = 60;

export type FeedStatus = "ok" | "error" | "needs-config" | "disabled" | "unknown";

interface FeedRow {
  id: string;
  enabled: number;
  config: string;
  last_refresh_at: string | null;
  last_status: string;
  last_error: string | null;
  last_duration_ms: number | null;
  last_item_count: number | null;
}

function readRow(id: string): FeedRow | undefined {
  return getDB().prepare("SELECT * FROM feeds WHERE id = ?").get(id) as FeedRow | undefined;
}

function ensureRow(feed: FeedModule): FeedRow {
  const existing = readRow(feed.id);
  if (existing) return existing;
  getDB()
    .prepare("INSERT OR REPLACE INTO feeds (id, enabled, config) VALUES (?, ?, ?)")
    .run(feed.id, feed.enabled ?? 0, JSON.stringify(feed.defaults));
  return readRow(feed.id)!;
}

const running = new Set<string>();

export interface RefreshResult {
  id: string;
  status: FeedStatus;
  itemCount: number;
  durationMs: number;
  error?: string;
}

export async function refreshFeed(id: string): Promise<RefreshResult> {
  const feed = feedById(id);
  if (!feed) throw new Error(`Unknown feed: ${id}`);
  loadEnv();
  const row = ensureRow(feed);
  const started = Date.now();

  if (!row.enabled) {
    return { id, status: "disabled", itemCount: 0, durationMs: 0 };
  }
  if (running.has(id)) {
    return { id, status: "unknown", itemCount: 0, durationMs: 0, error: "refresh already in flight" };
  }
  running.add(id);

  const db = getDB();
  try {
    const cfg = effectiveConfig(feed, safeParse(row.config));
    const missing = missingKeys(feed, cfg);
    if (missing.length) {
      db.prepare(
        `UPDATE feeds SET last_status = 'needs-config', last_error = ?, last_refresh_at = datetime('now') WHERE id = ?`
      ).run(`missing config: ${missing.join(", ")}`, id);
      logFeedEvent(id, "error", `needs config (${missing.join(", ")})`);
      return { id, status: "needs-config", itemCount: 0, durationMs: Date.now() - started, error: `missing ${missing.join(", ")}` };
    }

    const result = await feed.fetch(cfg);
    const durationMs = Date.now() - started;

    const upsert = db.prepare(
      "INSERT OR REPLACE INTO feed_items (feed_id, guid, published_at, data) VALUES (?, ?, ?, ?)"
    );
    const write = db.transaction((items: FeedItem[]) => {
      for (const item of items) {
        upsert.run(id, item.guid, item.publishedAt ?? null, JSON.stringify(item));
      }
    });
    write(result.items);

    // prune to newest N
    db.prepare(
      `DELETE FROM feed_items WHERE feed_id = ? AND guid NOT IN (
         SELECT guid FROM feed_items WHERE feed_id = ? ORDER BY
           CASE WHEN published_at IS NULL THEN 0 ELSE 1 END DESC, published_at DESC
         LIMIT ?
       )`
    ).run(id, id, MAX_ITEMS_PER_FEED);

    if (result.meta) {
      const prev = getKv<Record<string, unknown>>(`feedmeta:${id}`, {});
      setKv(`feedmeta:${id}`, { ...prev, ...result.meta, refreshedAt: new Date().toISOString() });
    }

    db.prepare(
      `UPDATE feeds SET last_refresh_at = datetime('now'), last_status = 'ok',
        last_error = NULL, last_duration_ms = ?, last_item_count = ? WHERE id = ?`
    ).run(durationMs, result.items.length, id);
    logFeedEvent(id, "ok", `refreshed · ${result.items.length} items · ${durationMs}ms`);

    return { id, status: "ok", itemCount: result.items.length, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE feeds SET last_refresh_at = datetime('now'), last_status = 'error',
        last_error = ?, last_duration_ms = ? WHERE id = ?`
    ).run(message, durationMs, id);
    logFeedEvent(id, "error", message.slice(0, 300));
    return { id, status: "error", itemCount: 0, durationMs, error: message };
  } finally {
    running.delete(id);
  }
}

export interface TestRecord {
  ok: boolean;
  message: string;
  detail?: string;
  at: string;
}

export async function testFeed(id: string): Promise<TestRecord> {
  const feed = feedById(id);
  if (!feed) throw new Error(`Unknown feed: ${id}`);
  loadEnv();
  const row = ensureRow(feed);
  const cfg = effectiveConfig(feed, safeParse(row.config));
  const missing = missingKeys(feed, cfg);

  let record: TestRecord;
  if (missing.length) {
    record = { ok: false, message: `needs config: ${missing.join(", ")}`, at: new Date().toISOString() };
  } else {
    try {
      const result = await feed.test(cfg);
      record = { ok: result.ok, message: result.message, detail: result.detail, at: new Date().toISOString() };
    } catch (err) {
      record = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString()
      };
    }
  }
  setKv(`feedtest:${id}`, record);
  logFeedEvent(id, record.ok ? "ok" : "error", `connection test ${record.ok ? "passed" : "failed"} · ${record.message}`.slice(0, 300));
  return record;
}

export interface FeedStatusEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: string;
  enabled: boolean;
  status: FeedStatus;
  lastRefreshAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastItemCount: number | null;
  refreshMinutes: number;
  configKeys: string[];
  missingKeys: string[];
  lastTest: TestRecord | null;
  linkOnly?: boolean;
  note?: string;
}

export function getFeedStatuses(): FeedStatusEntry[] {
  loadEnv();
  const entries: FeedStatusEntry[] = FEEDS.map((feed) => {
    const row = ensureRow(feed);
    const cfg = effectiveConfig(feed, safeParse(row.config));
    const missing = missingKeys(feed, cfg);
    const status: FeedStatus = !row.enabled
      ? "disabled"
      : row.last_status === "needs-config" || missing.length
        ? "needs-config"
        : (row.last_status as FeedStatus);
    return {
      id: feed.id,
      label: feed.label,
      description: feed.description,
      category: feed.category,
      icon: feed.icon,
      enabled: !!row.enabled,
      status,
      lastRefreshAt: row.last_refresh_at,
      lastError: row.last_error,
      lastDurationMs: row.last_duration_ms,
      lastItemCount: row.last_item_count,
      refreshMinutes: feed.refreshMinutes,
      configKeys: Object.keys(feed.fields).map((i) => feed.fields[Number(i)].key),
      missingKeys: missing,
      lastTest: getKv<TestRecord | null>(`feedtest:${feed.id}`, null)
    };
  });
  for (const lo of LINK_ONLY) {
    entries.push({
      id: lo.id,
      label: lo.label,
      description: lo.note,
      category: "link-only",
      icon: "—",
      enabled: false,
      status: "disabled",
      lastRefreshAt: null,
      lastError: null,
      lastDurationMs: null,
      lastItemCount: null,
      refreshMinutes: 0,
      configKeys: [],
      missingKeys: [],
      lastTest: null,
      linkOnly: true,
      note: lo.note
    });
  }
  return entries;
}

export function getFeedItems(id: string, limit = 30): FeedItem[] {
  const rows = getDB()
    .prepare(
      `SELECT data FROM feed_items WHERE feed_id = ? ORDER BY
         CASE WHEN published_at IS NULL THEN 0 ELSE 1 END DESC, published_at DESC
       LIMIT ?`
    )
    .all(id, limit) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as FeedItem);
}

export function getFeedMeta<T = Record<string, unknown>>(id: string): T | null {
  return getKv<T | null>(`feedmeta:${id}`, null);
}

function safeParse(s: string): Record<string, string> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

// ─── scheduler ──────────────────────────────────────────────────────────
// Lazy-started, single-instance interval. Every tick, any enabled feed past
// its refresh interval (plus a stable per-feed jitter) gets refreshed.

const SCHEDULER_KEY = Symbol.for("tapps-live.scheduler");

export function ensureScheduler(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[SCHEDULER_KEY]) return;
  if (process.env.VITEST || process.env.ASTRO_BUILD === "1" || process.env.TAPPS_NO_SCHEDULER === "1") return;
  g[SCHEDULER_KEY] = true;

  const tick = async () => {
    try {
      for (const feed of FEEDS) {
        const row = readRow(feed.id);
        if (!row?.enabled) continue;
        const last = row.last_refresh_at ? Date.parse(row.last_refresh_at.replace(" ", "T") + "Z") : 0;
        const jitter = ((feed.id.length * 47) % 90) * 1000; // 0–90s stable spread
        const due = last + feed.refreshMinutes * 60_000 + jitter;
        if (Date.now() >= due) {
          void refreshFeed(feed.id).catch(() => {});
        }
      }
    } catch {
      // scheduler must never take the process down
    }
  };
  // first tick shortly after boot so a fresh deploy warms quickly
  setTimeout(() => void tick(), 4_000).unref?.();
  setInterval(() => void tick(), 30_000).unref?.();
}

export async function refreshAllEnabled(): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const feed of FEEDS) {
    const row = ensureRow(feed);
    if (row.enabled) results.push(await refreshFeed(feed.id));
  }
  return results;
}
