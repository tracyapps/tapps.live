// artbytapps.com — WordPress/WooCommerce RSS. No keys needed; images come
// from media:content, enclosure, or the first <img> in content:encoded.
import { XMLParser } from "fast-xml-parser";
import type { FeedModule, FeedItem, FeedFetchResult, FeedTestResult } from "./types";
import { fetchText } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true
});

interface Loose {
  [k: string]: unknown;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Loose)) return String((v as Loose)["#text"]);
  return String(v);
}

export function firstImageFromHtml(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

export interface NormalizedArtItem {
  guid: string;
  title: string;
  url: string;
  publishedAt?: string;
  image?: string;
  excerpt: string;
}

/** Parse a WordPress RSS document into normalized art items. */
export function parseWordPressRss(xml: string, sourceLabel = "artbytapps.com"): NormalizedArtItem[] {
  const doc = parser.parse(xml) as Loose;
  const channel = ((doc.rss as Loose | undefined)?.channel ?? (doc.channel as Loose | undefined)) as Loose | undefined;
  if (!channel) return [];
  const rawItems = asArray<Loose>(channel.item as Loose["item"]);

  return rawItems.slice(0, 24).map((item) => {
    const title = textOf(item.title) || "untitled";
    const link = textOf(item.link) || textOf(item.guid);
    const content = textOf(item["content:encoded"]);
    const excerptRaw = textOf(item.description);
    let image: string | undefined;

    const media = item["media:content"] ?? item["media:thumbnail"];
    if (media) {
      const first = asArray<Loose>(media as Loose | Loose[])[0];
      const url = first?.["@_url"];
      if (typeof url === "string" && url) image = url;
    }
    if (!image && item.enclosure) {
      const enc = asArray<Loose>(item.enclosure as Loose | Loose[])[0];
      const url = enc?.["@_url"];
      const type = enc?.["@_type"];
      if (typeof url === "string" && url && (!type || String(type).startsWith("image/"))) image = url;
    }
    if (!image) image = firstImageFromHtml(content);

    const pubRaw = textOf(item.pubDate);
    const publishedAt = pubRaw ? new Date(pubRaw).toISOString() : undefined;

    const excerptSource = excerptRaw || content;
    const excerpt = excerptSource
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#8217;/g, "’")
      .replace(/&hellip;|&#8230;/g, "…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);

    return {
      guid: textOf(item.guid) || link || title,
      title,
      url: link || `https://${sourceLabel}`,
      publishedAt,
      image,
      excerpt
    };
  });
}

export const artFeed: FeedModule = {
  id: "art",
  label: "Art feed (artbytapps.com)",
  description:
    "Latest artwork posts pulled from the WordPress RSS feed at artbytapps.com. Works today and keeps working when the new design ships — same feed URL.",
  category: "content",
  icon: "ART",
  fields: [
    { key: "feedUrl", label: "Feed URL", type: "url", placeholder: "https://artbytapps.com/feed/" }
  ],
  defaults: { feedUrl: "https://artbytapps.com/feed/" },
  envMap: { feedUrl: "ART_FEED_URL" },
  requiredKeys: ["feedUrl"],
  refreshMinutes: 30,

  async fetch(cfg): Promise<FeedFetchResult> {
    const xml = await fetchText(cfg.feedUrl);
    const parsed = parseWordPressRss(xml);
    if (!parsed.length) throw new Error("Feed parsed but contained zero items — is this a WordPress RSS feed?");
    const items: FeedItem[] = parsed.map((p) => ({
      guid: p.guid,
      title: p.title,
      url: p.url,
      publishedAt: p.publishedAt,
      image: p.image,
      kind: "artwork",
      detail: p.excerpt
    }));
    return { items, meta: { source: cfg.feedUrl, pulled: items.length } };
  },

  async test(cfg): Promise<FeedTestResult> {
    const xml = await fetchText(cfg.feedUrl, {}, 10000);
    const parsed = parseWordPressRss(xml);
    if (!parsed.length) {
      return { ok: false, message: "Feed reachable but no items found", detail: "Check that the URL is the site's RSS feed (…/feed/)." };
    }
    return {
      ok: true,
      message: `Connected · ${parsed.length} items`,
      detail: `latest: “${parsed[0].title}”${parsed[0].image ? " · with images" : " · no images found in feed"}`
    };
  }
};
