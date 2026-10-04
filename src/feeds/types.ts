// The feed contract. Every integration — GitHub, RSS, Twitch, last.fm,
// YouTube, Bluesky — implements this one interface, which is what keeps the
// admin console (toggles, config forms, status page, tests) generic.

export interface FeedItem {
  guid: string;
  title: string;
  url?: string;
  publishedAt?: string; // ISO
  image?: string;
  kind?: string; // e.g. PushEvent, track, artwork, video, post
  detail?: string;
  extra?: Record<string, unknown>;
}

export interface FeedMeta {
  // feed-specific structured data: twitch live state, github language split,
  // roadmap sync results… stored alongside the items and read by widgets.
  [key: string]: unknown;
}

export interface FeedFetchResult {
  items: FeedItem[];
  meta?: FeedMeta;
}

export interface FeedField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
}

export type FeedTestResult =
  | { ok: true; message: string; detail?: string }
  | { ok: false; message: string; detail?: string };

export interface FeedModule {
  id: string;
  label: string;
  description: string;
  category: "activity" | "content" | "presence" | "music";
  icon: string; // short glyph used in admin
  fields: FeedField[];
  defaults: Record<string, string>;
  /** env var per config key — env wins over DB config when set */
  envMap?: Record<string, string>;
  /** config keys that must be non-empty before fetch/test can run */
  requiredKeys: string[];
  refreshMinutes: number;
  fetch(cfg: Record<string, string>): Promise<FeedFetchResult>;
  test(cfg: Record<string, string>): Promise<FeedTestResult>;
}

export class FeedError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "tapps-live/1.0 (+https://tapps.live)",
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FeedError(
      `${url.split("?")[0]} responded ${res.status} ${res.statusText}`,
      res.status
    );
  }
  return res;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  return (await res.json()) as T;
}

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  return await res.text();
}

/** Merge DB config ← defaults ← env overrides into the effective config. */
export function effectiveConfig(feed: FeedModule, dbConfig: Record<string, string>): Record<string, string> {
  const cfg: Record<string, string> = {};
  for (const [k, v] of Object.entries(feed.defaults)) cfg[k] = v;
  for (const [k, v] of Object.entries(dbConfig || {})) if (v != null && v !== "") cfg[k] = v;
  if (feed.envMap) {
    for (const [cfgKey, envKey] of Object.entries(feed.envMap)) {
      const fromEnv = process.env[envKey];
      if (fromEnv && fromEnv.trim()) cfg[cfgKey] = fromEnv.trim();
    }
  }
  return cfg;
}

export function missingKeys(feed: FeedModule, cfg: Record<string, string>): string[] {
  return feed.requiredKeys.filter((k) => !cfg[k] || !String(cfg[k]).trim());
}
