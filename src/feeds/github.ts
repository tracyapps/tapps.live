// GitHub — public activity, language split across repos, and ROADMAP.md
// sync for any project that names a repo. Works keyless (60 req/h shared);
// GITHUB_TOKEN raises it to 5k.
import type { FeedModule, FeedItem, FeedFetchResult, FeedTestResult } from "./types";
import { fetchJson, fetchText, FeedError } from "./types";
import { parseRoadmap } from "./roadmap";
import { getDB, getProjects, logFeedEvent } from "../lib/db";

const USEFUL = new Set([
  "PushEvent",
  "PullRequestEvent",
  "CreateEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "WatchEvent"
]);

interface GhEvent {
  id: string;
  type: string;
  created_at: string;
  repo?: { name: string };
  payload?: {
    commits?: { message: string }[];
    ref_type?: string;
    ref?: string;
    action?: string;
    pull_request?: { title: string; html_url?: string };
    issue?: { title: string; html_url?: string };
    release?: { tag_name: string; html_url?: string };
  };
}

/** Normalize a raw public event into a feed item (title/detail/url). */
export function normalizeEvent(evt: Partial<GhEvent>): FeedItem | null {
  const type = evt.type || "Event";
  const repo = evt.repo?.name || "unknown";
  const payload = evt.payload || {};
  let title = "";
  let detail = "";
  let url = `https://github.com/${repo}`;

  if (type === "PushEvent") {
    const commits = payload.commits || [];
    title = commits.length ? commits[0].message.split("\n")[0] : `Pushed to ${repo}`;
    detail = `${commits.length} commit${commits.length === 1 ? "" : "s"}`;
  } else if (type === "CreateEvent") {
    title = `Created ${payload.ref_type || "ref"}${payload.ref ? " " + payload.ref : ""}`;
    detail = "new branch or tag";
  } else if (type === "PullRequestEvent") {
    title = payload.pull_request?.title || "Pull request";
    detail = `${payload.action || "updated"} a pull request`;
    url = payload.pull_request?.html_url || url;
  } else if (type === "IssuesEvent") {
    title = payload.issue?.title || "Issue";
    detail = `${payload.action || "updated"} an issue`;
    url = payload.issue?.html_url || url;
  } else if (type === "WatchEvent") {
    title = `Starred ${repo}`;
    detail = "showed some love";
  } else if (type === "ReleaseEvent") {
    title = `Released ${payload.release?.tag_name || ""}`.trim();
    detail = "shipped";
    url = payload.release?.html_url || url;
  } else {
    title = type.replace(/Event$/, "");
    detail = "activity";
  }

  return {
    guid: String(evt.id || `${type}-${repo}-${evt.created_at}`),
    title,
    url,
    publishedAt: evt.created_at,
    kind: type,
    detail,
    extra: { repo }
  };
}

export interface RepoLang {
  label: string;
  pct: number;
}

/** Turn the repos list into a language share table (by repo count). */
export function languagesFromRepos(
  repos: { language: string | null }[],
  topN = 6
): RepoLang[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of repos) {
    const lang = (r.language || "").trim();
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) || 0) + 1);
    total += 1;
  }
  if (!total) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([label, n]) => ({ label, pct: Math.round((n / total) * 100) }));
}

async function ghHeaders(token: string | undefined): Promise<Record<string, string>> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function syncRoadmaps(username: string, headers: Record<string, string>) {
  const results: Record<string, { ok: boolean; pct: number | null; phases: number; error?: string }> = {};
  const db = getDB();
  const projects = getProjects().filter((p) => p.repo && p.repo.includes("/"));

  for (const p of projects) {
    try {
      const raw = await fetchText(
        `https://raw.githubusercontent.com/${p.repo}/HEAD/${p.roadmap_path || "ROADMAP.md"}`,
        { headers: { accept: "text/plain" } }
      );
      if (raw.includes("404: Not Found")) throw new FeedError("ROADMAP.md not found on default branch", 404);
      const parsed = parseRoadmap(raw);
      if (!parsed.phases.length) throw new FeedError("ROADMAP.md parsed but contained no phases");
      // a roadmap with headings but zero checkboxes would null out progress —
      // skip those rather than wipe a project that has a manual roadmap
      const taskTotal = parsed.phases.reduce((a, ph) => a + (ph as { total?: number }).total, 0);
      if (parsed.progress == null && taskTotal === 0) {
        throw new FeedError("ROADMAP.md has phases but no checkboxes and no progress: line — skipped");
      }
      db.prepare(
        "UPDATE projects SET progress = ?, roadmap = ?, updated_at = datetime('now') WHERE slug = ?"
      ).run(parsed.progress, JSON.stringify(parsed.phases), p.slug);
      results[p.slug] = { ok: true, pct: parsed.progress, phases: parsed.phases.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[p.slug] = { ok: false, pct: null, phases: 0, error: message };
    }
  }
  if (Object.keys(results).length) {
    logFeedEvent("github", "info", `roadmap sync: ${Object.values(results).filter((r) => r.ok).length}/${Object.keys(results).length} repos`);
  }
  return results;
}

export const githubFeed: FeedModule = {
  id: "github",
  label: "GitHub",
  description:
    "Public activity stream, language split across repos, and ROADMAP.md sync for projects that name a repo. Runs keyless; add a PAT to raise the rate limit.",
  category: "activity",
  icon: "GH",
  fields: [
    { key: "username", label: "Username", type: "text", placeholder: "tracyapps" },
    { key: "token", label: "Personal access token", type: "password", placeholder: "ghp_…", help: "Optional — no scopes needed for public data." }
  ],
  defaults: { username: "tracyapps", token: "" },
  envMap: { token: "GITHUB_TOKEN" },
  requiredKeys: ["username"],
  refreshMinutes: 10,

  async fetch(cfg) {
    const headers = await ghHeaders(cfg.token);
    const events = await fetchJson<GhEvent[]>(
      `https://api.github.com/users/${cfg.username}/events/public?per_page=40`,
      { headers }
    );
    const items = events
      .filter((e) => USEFUL.has(e.type))
      .map(normalizeEvent)
      .filter((x): x is FeedItem => !!x);

    // repos + languages, cheaper cadence — refresh when stale (>= 12h)
    const db = getDB();
    const metaRow = db.prepare("SELECT value FROM kv WHERE key = 'feedmeta:github'").get() as { value: string } | undefined;
    let langs: RepoLang[] = [];
    let langsAt: string | undefined;
    let meta: Record<string, unknown> = {};
    try {
      meta = metaRow ? JSON.parse(metaRow.value) : {};
    } catch { meta = {}; }
    const lastLangs = (meta.langsAt ? Date.parse(String(meta.langsAt)) : 0) || 0;
    if (Date.now() - lastLangs > 12 * 3600 * 1000) {
      const repos = await fetchJson<{ language: string | null; pushed_at: string; stargazers_count: number; html_url: string; name: string }[]>(
        `https://api.github.com/users/${cfg.username}/repos?per_page=100&sort=pushed`,
        { headers }
      );
      langs = languagesFromRepos(repos);
      meta.langs = langs;
      meta.langsAt = new Date().toISOString();
      meta.repos = repos.slice(0, 6).map((r) => ({ name: r.name, url: r.html_url, stars: r.stargazers_count, pushed: r.pushed_at }));
    }

    const roadmapSync = await syncRoadmaps(cfg.username, headers);
    return {
      items,
      meta: { ...meta, username: cfg.username, roadmapSync }
    };
  },

  async test(cfg) {
    const headers = await ghHeaders(cfg.token);
    const user = await fetchJson<{ login: string; public_repos: number }>(
      `https://api.github.com/users/${cfg.username}`,
      { headers }
    );
    if (user.login.toLowerCase() !== cfg.username.toLowerCase()) {
      return { ok: false, message: `API resolved to @${user.login}, expected @${cfg.username}` };
    }
    // verify rate limit headroom while we're here
    const limits = await fetchJson<{ rate: { remaining: number; limit: number } }>(
      "https://api.github.com/rate_limit",
      { headers }
    );
    return {
      ok: true,
      message: `Connected to @${user.login} · ${user.public_repos} public repos`,
      detail: `rate limit ${limits.rate.remaining}/${limits.rate.limit}${cfg.token ? " (token)" : " (keyless)"}`
    };
  }
};
