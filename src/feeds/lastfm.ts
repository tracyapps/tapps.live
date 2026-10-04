// last.fm — recent tracks (with now-playing) + weekly top artists. Free API
// key, no secret. Powers the "on the turntable" widget.
import type { FeedModule, FeedFetchResult, FeedTestResult, FeedItem } from "./types";
import { fetchJson, FeedError } from "./types";

export interface NormalizedTrack {
  artist: string;
  name: string;
  album?: string;
  url?: string;
  image?: string;
  nowPlaying?: boolean;
  uts?: number;
}

interface LfmTrack {
  artist: { "#text": string };
  name: string;
  album?: { "#text": string };
  url?: string;
  image?: { "#text": string; size: string }[];
  date?: { uts: string };
  "@attr"?: { nowplaying: string };
}

export function normalizeTracks(tracks: LfmTrack[]): NormalizedTrack[] {
  return tracks.map((t) => ({
    artist: t.artist?.["#text"] ?? "",
    name: t.name ?? "",
    album: t.album?.["#text"],
    url: t.url,
    image: t.image?.find((i) => i.size === "medium" || i.size === "extralarge")?.["#text"] || undefined,
    nowPlaying: t["@attr"]?.nowplaying === "true",
    uts: t.date?.uts ? Number(t.date.uts) : undefined
  }));
}

export interface TopArtist {
  name: string;
  count: number;
  url?: string;
}

export function normalizeTopArtists(artists: { name: string; playcount: string; url?: string }[], topN = 8): TopArtist[] {
  return artists.slice(0, topN).map((a) => ({ name: a.name, count: Number(a.playcount) || 0, url: a.url }));
}

async function lfm(method: string, params: Record<string, string>, apiKey: string) {
  const qs = new URLSearchParams({ method, api_key: apiKey, format: "json", ...params });
  return fetchJson<Record<string, unknown>>(
    `https://ws.audioscrobbler.com/2.0/?${qs.toString()}`,
    {},
    10000
  );
}

export const lastfmFeed: FeedModule = {
  id: "lastfm",
  label: "last.fm",
  description:
    "Recent tracks (spinning-now included) and weekly top artists. Just needs a free API key from last.fm/api/account/create.",
  category: "music",
  icon: "LFM",
  fields: [
    { key: "apiKey", label: "API key", type: "password" },
    { key: "user", label: "Username", type: "text", placeholder: "tracyapps" }
  ],
  defaults: { apiKey: "", user: "tracyapps" },
  envMap: { apiKey: "LASTFM_API_KEY", user: "LASTFM_USER" },
  requiredKeys: ["apiKey", "user"],
  refreshMinutes: 5,

  async fetch(cfg): Promise<FeedFetchResult> {
    const recent = await lfm("user.getrecenttracks", { user: cfg.user, limit: "12" }, cfg.apiKey);
    const recentTracks = normalizeTracks(
      ((recent.recenttracks as { track?: LfmTrack[] | LfmTrack })?.track as LfmTrack[] | undefined) ?? []
    );
    if (!recentTracks.length) throw new FeedError("last.fm returned zero tracks — user may not exist or have no scrobbles");

    let top: TopArtist[] = [];
    try {
      const weekly = await lfm("user.gettopartists", { user: cfg.user, period: "7day", limit: "8" }, cfg.apiKey);
      top = normalizeTopArtists(
        ((weekly.topartists as { artist?: { name: string; playcount: string; url?: string }[] })?.artist ?? [])
      );
    } catch {
      // weekly chart is a nice-to-have; recent tracks are the widget core
    }

    return {
      items: recentTracks.map<FeedItem>((t) => ({
        guid: t.nowPlaying ? `lfm:now:${t.artist}:${t.name}` : `lfm:${t.uts}:${t.artist}:${t.name}`,
        title: `${t.name} — ${t.artist}`,
        url: t.url,
        publishedAt: t.uts ? new Date(t.uts * 1000).toISOString() : undefined,
        image: t.image,
        kind: "track",
        detail: t.nowPlaying ? "now playing" : undefined,
        extra: { artist: t.artist, name: t.name, nowPlaying: !!t.nowPlaying }
      })),
      meta: { nowPlaying: recentTracks.find((t) => t.nowPlaying) ?? null, topArtists: top, user: cfg.user }
    };
  },

  async test(cfg): Promise<FeedTestResult> {
    const info = await lfm("user.getinfo", { user: cfg.user }, cfg.apiKey);
    const name = ((info.user as { name?: string; playcount?: string }) ?? {}).name;
    if (!name) {
      return { ok: false, message: "Key accepted structure check failed", detail: "user.getinfo returned no user — check the API key and username." };
    }
    const plays = (info.user as { playcount?: string }).playcount ?? "?";
    return { ok: true, message: `Connected to ${name} · ${plays} scrobbles`, detail: "user.getinfo verified with this key." };
  }
};
