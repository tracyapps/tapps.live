// YouTube — the public channel RSS feed (no API key, no quota). Gives
// latest uploads with thumbnails; good enough for "latest videos" widgets.
import { XMLParser } from "fast-xml-parser";
import type { FeedModule, FeedFetchResult, FeedTestResult, FeedItem } from "./types";
import { fetchText } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

interface Loose { [k: string]: unknown }

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export interface NormalizedVideo {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  image?: string;
}

export function parseYouTubeAtom(xml: string): NormalizedVideo[] {
  const doc = parser.parse(xml) as Loose;
  const feed = doc.feed as Loose | undefined;
  if (!feed) return [];
  const entries = asArray<Loose>(feed.entry as Loose["entry"]);
  return entries.slice(0, 12).map((e) => {
    const id = textOf(e["yt:videoId"]) || textOf(e.id);
    const group = (e["media:group"] as Loose) || {};
    let image: string | undefined;
    const thumb = group["media:thumbnail"];
    if (thumb && typeof thumb === "object") image = String((thumb as Loose)["@_url"] || "") || undefined;
    return {
      id,
      title: textOf(e.title),
      url: `https://www.youtube.com/watch?v=${id}`,
      publishedAt: textOf(e.published) || undefined,
      image
    };
  });
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "#text" in (v as Loose)) return String((v as Loose)["#text"]);
  return typeof v === "string" ? v : String(v ?? "");
}

export const youtubeFeed: FeedModule = {
  id: "youtube",
  label: "YouTube",
  description:
    "Latest videos from the channel RSS feed — works without an API key. Live-stream detection still comes from the Twitch feed for now.",
  category: "presence",
  icon: "YT",
  fields: [
    {
      key: "channelId",
      label: "Channel ID",
      type: "text",
      placeholder: "UC…",
      help: "youtube.com/account_advanced → Channel ID (starts with UC)."
    }
  ],
  defaults: { channelId: "" },
  envMap: { channelId: "YOUTUBE_CHANNEL_ID" },
  requiredKeys: ["channelId"],
  refreshMinutes: 15,

  async fetch(cfg): Promise<FeedFetchResult> {
    const xml = await fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cfg.channelId)}`
    );
    const videos = parseYouTubeAtom(xml);
    if (!videos.length) throw new Error("Channel feed parsed but contained zero videos");
    return {
      items: videos.map<FeedItem>((v) => ({
        guid: `yt:${v.id}`,
        title: v.title,
        url: v.url,
        publishedAt: v.publishedAt,
        image: v.image,
        kind: "video"
      })),
      meta: { channelId: cfg.channelId }
    };
  },

  async test(cfg): Promise<FeedTestResult> {
    if (!/^UC[\w-]{20,}$/.test(cfg.channelId)) {
      return { ok: false, message: "That doesn't look like a channel ID", detail: "Channel IDs start with UC and are ~24 characters. Handle URLs need the ID form." };
    }
    const xml = await fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cfg.channelId)}`,
      {},
      10000
    );
    const videos = parseYouTubeAtom(xml);
    if (!videos.length) return { ok: false, message: "Feed reachable but empty" };
    return {
      ok: true,
      message: `Connected · ${videos.length} videos`,
      detail: `latest: “${videos[0].title}”`
    };
  }
};
